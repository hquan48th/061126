import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, cp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { phpBackend, testSql } from '../tools/php-fixture.js';

const customer={name:'Khách kiểm thử đồng thời',phone:'0901234567',email:'test@example.com',address:'123 Địa chỉ kiểm thử Thành phố Hồ Chí Minh',note:''};
const orderBody=(quantity=1)=>({customer,items:[{variantId:'v1-1',quantity}],paymentMethod:'cod'});
async function fixture(t:any){const b=await phpBackend();t.after(b.close);const req=async(path:string,body?:unknown,cookie?:string,method?:string,extra={})=>fetch(b.base+path,{method:method||(body===undefined?'GET':'POST'),headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const login=async()=>{const r=await req('/api/auth/login',{email:'admin@fillico.local',password:'TestPassword2026!'});assert.equal(r.status,200);return r.headers.get('set-cookie')!.split(';')[0];};
 const stock=async()=>{const d=await(await req('/api/store')).json() as any;return d.products.find((p:any)=>p.id==='p1').variants[0].stock;};return {...b,req,login,stock};}

test('InnoDB concurrent requests: only one buyer gets the last item',async t=>{
 const b=await fixture(t);testSql(`UPDATE variants SET data=JSON_SET(data,'$.stock',1) WHERE id='v1-1';`);
 const responses=await Promise.all(Array.from({length:8},()=>b.req('/api/orders',orderBody())));
 assert.deepEqual(responses.map(r=>r.status).sort(),[201,409,409,409,409,409,409,409]);assert.equal(await b.stock(),0);
 assert.match(testSql('SELECT COUNT(*) AS n FROM orders;'),/\n1\n/);
});
test('parallel identical retries commit one order; parallel cancellations restore once',async t=>{
 const b=await fixture(t);const before=await b.stock();
 const rs=await Promise.all(Array.from({length:8},()=>b.req('/api/orders',orderBody(2),undefined,undefined,{'Idempotency-Key':'parallel-retry-0001'})));
 assert.ok(rs.every(r=>r.status===201));const values=await Promise.all(rs.map(r=>r.json())) as any[];assert.equal(new Set(values.map(v=>v.order.id)).size,1);assert.equal(new Set(values.map(v=>v.trackingToken)).size,1);assert.equal(await b.stock(),before-2);
 const cookie=await b.login();const id=values[0].order.id;const cancelled=await Promise.all(Array.from({length:8},()=>b.req('/api/admin/orders/'+id,{status:'cancelled'},cookie,'PATCH')));assert.ok(cancelled.every(r=>r.status===200));assert.equal(await b.stock(),before);
});
test('database failure after inventory mutation rolls back stock, order and idempotency',async t=>{
 const b=await fixture(t);const before=await b.stock();
 testSql("CREATE TRIGGER fail_order BEFORE INSERT ON orders FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic test failure';");
 try{const r=await b.req('/api/orders',orderBody(),undefined,undefined,{'Idempotency-Key':'rollback-trigger-01'});assert.equal(r.status,500);assert.equal(await b.stock(),before);assert.match(testSql('SELECT COUNT(*) FROM idempotency;'),/\n0\n/);assert.match(testSql('SELECT COUNT(*) FROM orders;'),/\n0\n/);}
 finally{testSql('DROP TRIGGER fail_order;');}
});
test('persistent login limit applies across Apache workers and server restart',async t=>{
 const b=await fixture(t);
 for(let i=0;i<12;i++)assert.equal((await b.req('/api/auth/login',{email:'unknown@example.com',password:'wrong-password'})).status,401);
 execFileSync('docker',['exec','fillico-web','apache2ctl','-k','graceful'],{stdio:'pipe'});
 const r=await b.req('/api/auth/login',{email:'admin@fillico.local',password:'TestPassword2026!'});assert.equal(r.status,429);assert.ok(Number(r.headers.get('retry-after'))>0);
});
test('malformed JSON, cross-site, content types, oversize and image dimensions',async t=>{
 const b=await fixture(t);const cookie=await b.login();
 assert.equal((await fetch(b.base+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
 assert.equal((await fetch(b.base+'/api/orders',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})).status,415);
 assert.equal((await b.req('/api/orders',orderBody(),undefined,undefined,{'Sec-Fetch-Site':'cross-site'})).status,403);
 assert.equal((await b.req('/api/orders',orderBody(),undefined,undefined,{Origin:'http://127.0.0.1:3101.evil.test'})).status,403);
 const large=await fetch(b.base+'/api/admin/uploads',{method:'POST',headers:{Cookie:cookie,'Content-Type':'image/png'},body:Buffer.alloc(5*1024*1024+1)});assert.equal(large.status,413);
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');image.writeUInt32BE(20000,16);
 const huge=await fetch(b.base+'/api/admin/uploads',{method:'POST',headers:{Cookie:cookie,'Content-Type':'image/png'},body:image});assert.equal(huge.status,400);
 const wrongMime=await fetch(b.base+'/api/admin/uploads',{method:'POST',headers:{Cookie:cookie,'Content-Type':'image/jpeg'},body:image});assert.equal(wrongMime.status,400);
});
test('Apache SPA reload and private/config/script/backup paths stay inaccessible',async t=>{
 const b=await fixture(t);
 for(const path of ['/admin','/san-pham/ban-chai-tre','/tra-cuu-don-hang']){const r=await b.req(path);assert.equal(r.status,200);assert.match(await r.text(),/id="root"/);}
 for(const path of ['/.git/config','/.local/admin-credentials.txt','/fillico-private/config.php','/fillico-private/uploads/test.php','/backup.sql','/uploads/test.php','/uploads/..%2fconfig.php']){const r=await b.req(path);assert.ok([403,404].includes(r.status),path);assert.doesNotMatch(await r.text(),/isolated-test-db/);}
});
test('PHP code update + schema reapplication preserve data and sessions; SQL dump restores',async t=>{
 const b=await fixture(t);const cookie=await b.login();const placed=await(await b.req('/api/orders',orderBody(2))).json() as any;
 const receipt='/api/admin/orders/'+placed.order.id+'/receipt';assert.equal((await b.req(receipt,{content:'Phiếu kiểm thử giữ nguyên dữ liệu'},cookie,'PUT')).status,200);
 const before=await(await b.req('/api/admin/orders',undefined,cookie)).text();const stock=await b.stock();
 // Redeploy exactly the tracked runtime files, preserving config and uploads.
 execFileSync('cp',['-R','php/src/.',join(b.sandbox,'fillico-private/src/')]);
 execFileSync('cp',['-R','php/public/.',join(b.sandbox,'public_html/')]);
 testSql(await readFile('php/migrations/001_initial.sql','utf8'));
 assert.equal(await(await b.req('/api/admin/orders',undefined,cookie)).text(),before);assert.equal(await b.stock(),stock);assert.match(await(await b.req(receipt,undefined,cookie)).text(),/Phiếu kiểm thử/);
 const dump=execFileSync('docker',['exec','fillico-db','mariadb-dump','-uroot','-pisolated-test-root','--single-transaction','--hex-blob','fillico_test'],{encoding:'utf8'});
 testSql('DELETE FROM order_receipts; DELETE FROM orders;');testSql(dump);
 assert.equal(await(await b.req('/api/admin/orders',undefined,cookie)).text(),before);assert.equal(await b.stock(),stock);assert.match(await(await b.req(receipt,undefined,cookie)).text(),/Phiếu kiểm thử/);
});

test('SQLite snapshot migration preserves every row, upload, private lookup and legacy retry; accounts reset safely',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'fillico-migration-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 execFileSync(process.execPath,['--import','tsx','php-tests/migration-fixture.ts',join(dir,'source')],{stdio:'pipe'});
 const source=join(dir,'source','store.sqlite');const before=await readFile(source);
 const node=(...args:string[])=>execFileSync(process.execPath,['tools/sqlite-to-mysql.mjs','--source',source,...args],{encoding:'utf8'});
 node('--check');node('--export','--out',join(dir,'export'));assert.deepEqual(await readFile(source),before);
 const report=JSON.parse(await readFile(join(dir,'export','report.json'),'utf8'));assert.equal(report.sourceCounts.sessions,1);assert.equal(report.targetCounts.sessions,0);
 const schema=await readFile('php/migrations/001_initial.sql','utf8');
 testSql('DROP DATABASE IF EXISTS fillico_migration; CREATE DATABASE fillico_migration CHARACTER SET utf8mb4 COLLATE utf8mb4_bin; GRANT ALL ON fillico_migration.* TO fillico; USE fillico_migration;\n'+schema+'\n'+await readFile(join(dir,'export','data.sql'),'utf8'));
 const verification=testSql('USE fillico_migration;\n'+await readFile(join(dir,'export','verify.sql'),'utf8'));assert.equal((verification.match(/\t1\t1/g)||[]).length,9,verification);
 const config="<?php return ['dsn'=>'mysql:host=fillico-db;dbname=fillico_migration;charset=utf8mb4','db_user'=>'fillico','db_password'=>'isolated-test-db','uploads_dir'=>'/migration/export/uploads'];";
 await writeFile(join(dir,'config.php'),config);
 const php=(script:string,args:string[]=[],input='')=>execFileSync('docker',['run','--rm','-i','--user','1000:1000','--network','fillico-test','--mount',`type=bind,src=${resolve('.')},dst=/app,readonly`,'--mount',`type=bind,src=${dir},dst=/migration`,'fillico-php-test','php',script,...args],{input,encoding:'utf8'});
 assert.match(php('/app/tools/verify-import.php',['/migration/config.php','/migration/export/manifest.json']),/Uploads match/);
 // Importing the same file into a populated target must do nothing at all.
 const duplicate=testSql('USE fillico_migration;\n'+await readFile(join(dir,'export','data.sql'),'utf8'));assert.match(duplicate,/STOP: target is not empty/);php('/app/tools/verify-import.php',['/migration/config.php','/migration/export/manifest.json']);
 const expected=JSON.parse(await readFile(join(dir,'source','expected.json'),'utf8'));
 await writeFile(join(dir,'exercise.php'),`<?php require '/app/php/src/bootstrap.php'; $c=require '/migration/config.php';$s=new Fillico\\Store($c);$e=Fillico\\decode(file_get_contents('/migration/source/expected.json'));$o=new Fillico\\Orders($s);$r=$s->transaction(fn()=>$o->create($e['body'],'legacy-retry-fixture'));if($r!==$e['placed'])throw new Exception('legacy retry changed');$u=$s->one("SELECT password_hash FROM users WHERE role='owner'");if(Fillico\\verifyPassword('LegacyPassword2026!',$u['password_hash']))throw new Exception('legacy password accepted');$row=$s->one('SELECT data FROM orders WHERE code=? AND token_hash=?',[$e['placed']['order']['code'],hash('sha256',$e['placed']['trackingToken'])]);if(!$row)throw new Exception('tracking lost');echo 'retry, tracking and password disable verified';`);
 assert.match(php('/migration/exercise.php'),/verified/);
 php('/app/tools/reset-password.php',[expected.ownerId,'/migration/reset.sql'],'NewMigrationPassword2026!\n');const reset=await readFile(join(dir,'reset.sql'),'utf8');assert.doesNotMatch(reset,/NewMigrationPassword2026/);testSql('USE fillico_migration;\n'+reset);
 await writeFile(join(dir,'password-check.php'),`<?php require '/app/php/src/bootstrap.php';$c=require '/migration/config.php';$s=new Fillico\\Store($c);$u=$s->one("SELECT password_hash FROM users WHERE role='owner'");if(!Fillico\\verifyPassword('NewMigrationPassword2026!',$u['password_hash']))throw new Exception('reset failed');echo 'reset verified';`);assert.match(php('/migration/password-check.php'),/reset verified/);
 // Schema drift / broken upload references must stop conversion before data.sql exists.
 await rm(join(dir,'source','uploads'),{recursive:true});assert.throws(()=>node('--check'),/Command failed/);
});

test('installer requires secret and origin, creates one owner with no products, then disables itself',async t=>{
 const b=await fixture(t);const lock=join(b.sandbox,'fillico-private/setup.lock');await rm(lock,{force:true});t.after(()=>rm(lock,{force:true}));
 testSql('SET FOREIGN_KEY_CHECKS=0; TRUNCATE sessions; TRUNCATE users; TRUNCATE variants; TRUNCATE products; TRUNCATE settings; SET FOREIGN_KEY_CHECKS=1;');
 const get=await b.req('/setup.php');assert.equal(get.status,200);const page=await get.text();assert.match(page,/PHP &gt;= 8.3/);assert.doesNotMatch(page,/isolated-test-db|phpinfo|isolated-setup-token/);
 const post=(token:string,origin='http://127.0.0.1:3101')=>fetch(b.base+'/setup.php',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token,name:'Chủ shop mới',email:'new-owner@example.com',password:'NewShopPassword2026!',repeat:'NewShopPassword2026!'})});
 assert.equal((await post('wrong')).status,403);assert.equal((await post('isolated-setup-token-00000000000000000000000000000','https://evil.test')).status,403);
 const rs=await Promise.all([post('isolated-setup-token-00000000000000000000000000000'),post('isolated-setup-token-00000000000000000000000000000')]);assert.equal(rs.filter(r=>r.status===200).length,1);assert.ok(rs.every(r=>[200,404,409].includes(r.status)));
 assert.equal((await b.req('/setup.php')).status,404);assert.equal((await(await b.req('/api/store')).json() as any).products.length,0);assert.match(testSql('SELECT COUNT(*) FROM users;'),/\n1\n/);
 assert.equal((await b.req('/api/auth/login',{email:'new-owner@example.com',password:'NewShopPassword2026!'})).status,200);
});

test('JSON object maps and numeric JSON values keep the JavaScript contract',async t=>{
 const b=await fixture(t);const cookie=await b.login();
 const r=await b.req('/api/admin/settings',{policies:{}},cookie,'PUT');assert.equal(r.status,200);assert.deepEqual((await r.json() as any).settings.policies,{});
 assert.deepEqual((await(await b.req('/api/store')).json() as any).settings.policies,{});
 assert.equal((await b.req('/api/admin/settings',{policies:[]},cookie,'PUT')).status,400);
 const numericKey=await b.req('/api/admin/settings',{policies:{'0':'Chính sách có mã số'}},cookie,'PUT');assert.equal(numericKey.status,200);assert.deepEqual((await numericKey.json() as any).settings.policies,{'0':'Chính sách có mã số'});
 const raw='{"customer":'+JSON.stringify(customer)+',"items":[{"variantId":"v1-1","quantity":1.0}],"paymentMethod":"cod","expectedTotal":120000.0}';
 const placed=await fetch(b.base+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:raw});assert.equal(placed.status,201);
});
