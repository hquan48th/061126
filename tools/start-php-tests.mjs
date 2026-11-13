// Local development only. Starts isolated test containers; never installs on hosting.
import { execFileSync } from 'node:child_process';
import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
const run=(args,options={})=>execFileSync('docker',args,{stdio:'inherit',...options});
for(const name of ['fillico-db','fillico-web']){
 const r=execFileSync('docker',['ps','-aq','--filter',`name=^/${name}$`],{encoding:'utf8'}).trim();if(r)throw new Error(`${name} exists. Stop/remove only your old disposable test containers before running setup.`);
}
const target=resolve(process.env.FILLICO_PHP_SANDBOX||'work/php-sandbox');
await mkdir(resolve('work'),{recursive:true});await mkdir(target,{recursive:false});
run(['build','--secret',`id=proxy_ca,src=${process.env.CODEX_PROXY_CERT||'/etc/ssl/certs/ca-certificates.crt'}`,'-f','tools/Dockerfile.test','-t','fillico-php-test','.']);
const nets=execFileSync('docker',['network','ls','--format','{{.Name}}'],{encoding:'utf8'}).split('\n');if(!nets.includes('fillico-test'))run(['network','create','fillico-test']);
run(['run','-d','--name','fillico-db','--label','fillico.disposable-test=true','--network','fillico-test','-e','MARIADB_ROOT_PASSWORD=isolated-test-root','-e','MARIADB_DATABASE=fillico_test','-e','MARIADB_USER=fillico','-e','MARIADB_PASSWORD=isolated-test-db','mariadb:10.11@sha256:7d829180b5b2a9ba74f6242876ab401a0d7dd338a807e522ef92bc9698760f20']);
let ready=false;for(let i=0;i<60;i++){try{run(['exec','fillico-db','mariadb','--protocol=TCP','-h127.0.0.1','-uroot','-pisolated-test-root','fillico_test','-e','SELECT 1'],{stdio:'pipe'});ready=true;break;}catch{}await setTimeout(1000);}
if(!ready)throw new Error('Disposable MariaDB did not become ready');
const priv=join(target,'fillico-private');await mkdir(join(priv,'uploads'),{recursive:true});await mkdir(join(target,'public_html'));
await cp('php/src',join(priv,'src'),{recursive:true});await cp('php/public',join(target,'public_html'),{recursive:true});await cp('dist',join(target,'public_html'),{recursive:true});
const {defaultSettings}=await import('../server/seed.ts');await writeFile(join(priv,'defaults.json'),JSON.stringify(defaultSettings));
await writeFile(join(priv,'config.php'),`<?php return ['dsn'=>'mysql:host=fillico-db;dbname=fillico_test;charset=utf8mb4','db_user'=>'fillico','db_password'=>'isolated-test-db','origin'=>'http://127.0.0.1:3101','uploads_dir'=>__DIR__.'/uploads','allow_http'=>true,'setup_token'=>'isolated-setup-token-00000000000000000000000000000'];\n`,{mode:0o600});
run(['exec','-i','fillico-db','mariadb','-uroot','-pisolated-test-root','fillico_test'],{input:await readFile('php/migrations/001_initial.sql'),stdio:['pipe','inherit','inherit']});
run(['run','-d','--name','fillico-web','--label','fillico.disposable-test=true','--network','fillico-test','-p','127.0.0.1:3101:80','-e','APACHE_RUN_USER=#1000','-e','APACHE_RUN_GROUP=#1000','--mount',`type=bind,src=${target},dst=/var/www`,'fillico-php-test']);
console.log('Isolated PHP/MariaDB/Apache ready. Run npm run test:php. Test URL: http://127.0.0.1:3101');
