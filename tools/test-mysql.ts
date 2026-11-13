import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,cp,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {defaultSettings,seedProducts} from '../server/seed.ts';
import assert from 'node:assert/strict';
const run=(args:string[],input='')=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const sql=(s:string)=>run(['exec','-i','fillico-fix-mysql','mysql','-uroot','-preview-only-root','--batch','fillico_review'],s);
const hex=(s:string)=>`CONVERT(0x${Buffer.from(s).toString('hex')} USING utf8mb4)`;
// Isolated synthetic database; this tool never accepts production credentials.
run(['run','-d','--name','fillico-fix-mysql','--label','fillico.disposable-test=true','--network','fillico-test','-e','MYSQL_ROOT_PASSWORD=review-only-root','-e','MYSQL_DATABASE=fillico_review','-e','MYSQL_USER=fillico','-e','MYSQL_PASSWORD=review-only-db','mysql:8.0@sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b']);
try {
let ready=false;for(let i=0;i<100;i++){try{sql('SELECT 1');ready=true;break;}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'MySQL did not become ready');
const hash=run(['exec','-i','fillico-web','php','-r','echo password_hash(trim(stream_get_contents(STDIN)),PASSWORD_ARGON2ID);'],'TestPassword2026!');
let seed=await readFile('php/migrations/001_initial.sql','utf8');seed+=`\nINSERT INTO settings VALUES(1,${hex(JSON.stringify(defaultSettings))});`;
for(const p of seedProducts){const {variants,...data}=p;seed+=`\nINSERT INTO products(id,slug,data) VALUES(${hex(p.id)},${hex(p.slug)},${hex(JSON.stringify({...data,revision:1}))});`;for(const v of variants)seed+=`\nINSERT INTO variants(id,product_id,data) VALUES(${hex(v.id)},${hex(p.id)},${hex(JSON.stringify(v))});`;}
seed+=`\nINSERT INTO users(id,email,name,role,password_hash) VALUES('test-owner','admin@fillico.local','Chủ shop','owner',${hex(hash)});`;sql(seed);
const sandbox=await mkdtemp(resolve('work/mysql-audit-'));await cp('dist',sandbox+'/public_html',{recursive:true});await cp('php/public',sandbox+'/public_html',{recursive:true});await mkdir(sandbox+'/fillico-private/uploads',{recursive:true});await cp('php/src',sandbox+'/fillico-private/src',{recursive:true});
await writeFile(sandbox+'/fillico-private/config.php',`<?php return ['dsn'=>'mysql:host=fillico-fix-mysql;dbname=fillico_review;charset=utf8mb4','db_user'=>'fillico','db_password'=>'review-only-db','origin'=>'http://127.0.0.1:3151','allow_http'=>true,'uploads_dir'=>__DIR__.'/uploads'];`);
run(['run','-d','--name','fillico-fix-web','--label','fillico.disposable-test=true','--network','fillico-test','-p','127.0.0.1:3151:80','-e','APACHE_RUN_USER=#1000','-e','APACHE_RUN_GROUP=#1000','--mount',`type=bind,src=${sandbox},dst=/var/www`,'fillico-php-test']);
const base='http://127.0.0.1:3151';for(let i=0;i<50;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const customer={name:'Khách thử MySQL',phone:'0901234567',email:'test@example.com',address:'123 Nguyễn Trãi Thành phố Hồ Chí Minh',note:''};const body={customer,items:[{variantId:'v1-1',quantity:1}],paymentMethod:'cod'};
const req=(path:string,b?:any,cookie?:string,method?:string,key?:string)=>fetch(base+path,{method:method??(b===undefined?'GET':'POST'),headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(key?{'Idempotency-Key':key}:{})},body:b===undefined?undefined:JSON.stringify(b)});
const stock=async()=>{const s=await(await req('/api/store')).json();return s.products.find((p:any)=>p.id==='p1').variants.find((v:any)=>v.id==='v1-1').stock;};
sql("UPDATE variants SET data=JSON_SET(data,'$.stock',1) WHERE id='v1-1'");
let rs=await Promise.all(Array.from({length:16},()=>req('/api/orders',body)));assert.deepEqual(rs.map(r=>r.status).sort(),[201,...Array(15).fill(409)]);assert.equal(await stock(),0);console.log('MySQL8: 16 last-item buyers -> 1 order, stock 0 PASS');
sql("UPDATE variants SET data=JSON_SET(data,'$.stock',20) WHERE id='v1-1'");
rs=await Promise.all(Array.from({length:16},()=>req('/api/orders',body,undefined,undefined,'mysql-review-retry')));assert.ok(rs.every(r=>r.status===201));const values=await Promise.all(rs.map(r=>r.json()));assert.equal(new Set(values.map(v=>v.order.id)).size,1);assert.equal(await stock(),19);
const login=await req('/api/auth/login',{email:'admin@fillico.local',password:'TestPassword2026!'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
rs=await Promise.all(Array.from({length:16},()=>req('/api/admin/orders/'+values[0].order.id,{status:'cancelled'},cookie,'PATCH')));assert.ok(rs.every(r=>r.status===200));assert.equal(await stock(),20);console.log('MySQL8: 16 retries -> 1 order; 16 cancellations -> stock restored once PASS');
sql("CREATE TRIGGER fail_order BEFORE INSERT ON orders FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='review failure';");assert.equal((await req('/api/orders',body)).status,500);assert.equal(await stock(),20);sql('DROP TRIGGER fail_order;');console.log('MySQL8: failure after stock update -> rollback PASS');
const dir=await mkdtemp(resolve('work/mysql-migration-'));execFileSync(process.execPath,['--import','tsx','php-tests/migration-fixture.ts',dir+'/source'],{stdio:'pipe'});execFileSync(process.execPath,['tools/sqlite-to-mysql.mjs','--source',dir+'/source/store.sqlite','--export','--out',dir+'/export'],{stdio:'pipe'});
sql('CREATE DATABASE fillico_review_import CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;USE fillico_review_import;\n'+await readFile('php/migrations/001_initial.sql','utf8')+'\n'+await readFile(dir+'/export/data.sql','utf8'));
const verification=sql('USE fillico_review_import;\n'+await readFile(dir+'/export/verify.sql','utf8'));assert.equal((verification.match(/\t1\t1/g)||[]).length,9);console.log('MySQL8: SQLite export/import, nine tables count+content hashes PASS');

console.log(sql('SELECT VERSION()'));
} finally {try{run(['rm','-f','fillico-fix-web']);}finally{run(['rm','-f','-v','fillico-fix-mysql']);}}
