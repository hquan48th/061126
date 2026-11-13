import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import https from 'node:https';

// Test the supported inside-public_html layout and actual Secure cookies over TLS.
const root=await mkdtemp(resolve('work/layout-'));
const pub=join(root,'public_html'),priv=join(pub,'fillico-private'),certs=join(root,'certs');
await mkdir(priv,{recursive:true});await mkdir(certs);
await cp('dist',pub,{recursive:true});await cp('php/public',pub,{recursive:true});await cp('php/src',join(priv,'src'),{recursive:true});await cp('php/.htaccess',join(priv,'.htaccess'));
await mkdir(join(priv,'uploads'));
const imageName='01234567-89ab-4cde-8f01-23456789abcd.png',image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64');
await writeFile(join(priv,'uploads',imageName),image);await writeFile(join(priv,'uploads','evil.php'),'<?php echo "SHOULD_NEVER_RUN";');
await mkdir(join(priv,'migrations'));await cp('php/migrations/001_initial.sql',join(priv,'migrations/001_initial.sql'));
await writeFile(join(priv,'config.php'),"<?php return ['dsn'=>'mysql:host=fillico-db;dbname=fillico_test;charset=utf8mb4','db_user'=>'fillico','db_password'=>'isolated-test-db','origin'=>'https://127.0.0.1:3443','uploads_dir'=>__DIR__.'/uploads','allow_http'=>false,'setup_token'=>''];");
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-sha256','-days','1','-nodes','-keyout',join(certs,'key.pem'),'-out',join(certs,'cert.pem'),'-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'pipe'});
await writeFile(join(certs,'site.conf'),`<VirtualHost *:443>\n ServerName 127.0.0.1\n DocumentRoot /var/www/public_html\n SSLEngine on\n SSLCertificateFile /test-certs/cert.pem\n SSLCertificateKeyFile /test-certs/key.pem\n</VirtualHost>\n`);
const cert=await readFile(join(certs,'cert.pem'));
function request(path,body){return new Promise((resolve,reject)=>{const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body));const req=https.request({hostname:'127.0.0.1',port:3443,path,method:bytes?'POST':'GET',ca:cert,headers:bytes?{'Content-Type':'application/json','Content-Length':bytes.length,Origin:'https://127.0.0.1:3443'}:{}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end(bytes);});}
let started=false;
try{
 execFileSync('docker',['run','-d','--name','fillico-layout','--label','fillico.disposable-test=true','--network','fillico-test','-p','127.0.0.1:3443:443','-e','APACHE_RUN_USER=#1000','-e','APACHE_RUN_GROUP=#1000','--mount',`type=bind,src=${root},dst=/var/www`,'--mount',`type=bind,src=${certs},dst=/test-certs,readonly`,'fillico-php-test','sh','-c','a2enmod ssl >/dev/null && cp /test-certs/site.conf /etc/apache2/sites-enabled/test-ssl.conf && exec apache2-foreground'],{stdio:'pipe'});started=true;
 let ready=false,lastError='';for(let i=0;i<30;i++){try{const r=await request('/api/health');if(r.status===200){ready=true;break;}lastError=`HTTP ${r.status}: ${r.body.toString().slice(0,300)}`;}catch(e){lastError=e.message;}await setTimeout(1000);}assert.ok(ready,'TLS Apache did not become ready: '+lastError);
 const login=await request('/api/auth/login',{email:'admin@fillico.local',password:'TestPassword2026!'});assert.equal(login.status,200);const cookie=login.headers['set-cookie'].join(';');assert.match(cookie,/secure/i);assert.match(cookie,/httponly/i);assert.match(cookie,/samesite=lax/i);
 const store=await request('/api/store');assert.equal(store.status,200);assert.ok(JSON.parse(store.body).products.length>0);assert.equal(store.headers['x-powered-by'],undefined);
 for(const path of ['/fillico-private/config.php','/fillico-private/src/Support.php','/fillico-private/migrations/001_initial.sql','/fillico-private/uploads/'+imageName,'/fillico-private/uploads/evil.php','/uploads/evil.php','/.git/config','/backup.sql']){const r=await request(path);assert.ok([403,404].includes(r.status),path);assert.doesNotMatch(r.body.toString(),/isolated-test-db|SHOULD_NEVER_RUN/);}
 const oldImage=await request('/uploads/'+imageName);assert.equal(oldImage.status,200);assert.deepEqual(oldImage.body,image);assert.match(oldImage.headers['content-type'],/image\/png/);
 for(const path of ['/admin','/san-pham/ban-chai-tre'])assert.match((await request(path)).body.toString(),/id="root"/);
 const storeBefore=(await request('/api/store')).body;
 const configBefore=await readFile(join(priv,'config.php'));
 // Reapply the whole code release; config/uploads/database are retained.
 for(const layout of ['inside','sibling']){
   const location=layout==='inside'?priv:join(root,'fillico-private');
   if(layout==='sibling')await import('node:fs/promises').then(fs=>fs.rename(priv,location));
   await cp('dist',pub,{recursive:true});await cp('php/public',pub,{recursive:true});await cp('php/src',join(location,'src'),{recursive:true});
   assert.deepEqual((await request('/api/store')).body,storeBefore);
   assert.deepEqual(await readFile(join(location,'config.php')),configBefore);
   assert.deepEqual((await request('/uploads/'+imageName)).body,image);
   const bootstrap=join(location,'src/bootstrap.php');const fs=await import('node:fs/promises');await fs.rename(bootstrap,bootstrap+'.held');
   try{const broken=await request('/api/store');assert.equal(broken.status,500);assert.doesNotMatch(broken.body.toString(),/var\/www|Fatal error|Stack trace|Warning/);}finally{await fs.rename(bootstrap+'.held',bootstrap);}
 }
 console.log('PASS: inside-public_html deny rules, old upload URL, SPA reload, real TLS Secure/HttpOnly/SameSite cookie. Certificate validated against the local test CA.');
}catch(e){if(started){const logs=spawnSync('docker',['logs','--tail','20','fillico-layout'],{encoding:'utf8'});console.error(logs.stdout,logs.stderr);}throw e;}
finally{if(started)execFileSync('docker',['rm','-f','fillico-layout'],{stdio:'pipe'});await rm(root,{recursive:true,force:true});}
