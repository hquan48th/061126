#!/usr/bin/env node
// Development machine only. Node >=24. Never run against the shop's only copy.
import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, readdir, lstat, readFile, writeFile, copyFile, chmod } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const args=process.argv.slice(2);const opt=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const source=opt('--source');const output=opt('--out');const exporting=args.includes('--export');
if(!source||(!args.includes('--check')&&!exporting)||(exporting&&!output)){
 console.error('Node 24+: node tools/sqlite-to-mysql.mjs --source /backup/store.sqlite --check\nExport with automatic SQLite snapshot: --source /backup/store.sqlite --export --out /NEW/private-directory');process.exit(1);
}
const expected={products:['id','slug','data'],variants:['id','product_id','data'],settings:['id','data'],orders:['id','code','token_hash','data'],order_receipts:['order_id','content','updated_at'],idempotency:['key','request_hash','response'],users:['id','email','name','role','password_hash'],sessions:['token_hash','user_id','expires'],audit:['id','user_id','action','detail','created_at']};
const digest=s=>createHash('sha256').update(s).digest('hex');
const sqlValue=v=>v===null?'NULL':typeof v==='number'?String(v):`CONVERT(0x${Buffer.from(v,'utf8').toString('hex')} USING utf8mb4)`;
const json=v=>{const d=JSON.parse(v);assert.ok(d&&typeof d==='object'&&!Array.isArray(d),'JSON object required');return d;};
const bounded=(s,n)=>assert.ok(typeof s==='string'&&s.length<=n,'text field exceeds target length');
const number=(n,max=Number.MAX_SAFE_INTEGER)=>assert.ok(Number.isSafeInteger(n)&&n>=0&&n<=max,'invalid numeric field');
let db;
try {
 const path=resolve(source);assert.ok((await lstat(path)).isFile(),'source is not a regular file');
 db=new DatabaseSync(path,{readOnly:true});db.exec('PRAGMA busy_timeout=5000');
 let snapshotPath;
 if(exporting){await mkdir(resolve(output),{recursive:false,mode:0o700});snapshotPath=join(resolve(output),'source-backup.sqlite');await backup(db,snapshotPath);await chmod(snapshotPath,0o600);db.close();db=new DatabaseSync(snapshotPath,{readOnly:true});}
 db.exec('BEGIN');
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','SQLite integrity check failed');
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'SQLite has broken foreign keys');
 const actual=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
 assert.deepEqual(actual,Object.keys(expected).sort(),'Unknown/missing tables; review source schema before exporting');
 const rows={};const counts={};const manifest={format:1,tables:{},revokedSessions:0,legacyPasswordReset:true,uploads:{}};
 for(const [table,columns] of Object.entries(expected)){
  assert.deepEqual(db.prepare(`PRAGMA table_info("${table}")`).all().map(r=>r.name),columns,`schema differs: ${table}`);
  rows[table]=db.prepare(`SELECT rowid AS __seq,* FROM "${table}" ORDER BY rowid`).all();counts[table]=rows[table].length;
  for(const [i,r] of rows[table].entries())try{
   for(const [k,v] of Object.entries(r)){if(k==='__seq')number(v);if(v!==null&&typeof v==='string')assert.ok(!v.includes('\u0000'),'NUL in text is not supported');}
   if(r.id!==undefined){if(typeof r.id==='string')bounded(r.id,100);else number(r.id);}
   if(table==='products'){const p=json(r.data);assert.equal(p.id,r.id);assert.equal(p.slug,r.slug);bounded(r.slug,160);assert.equal(typeof p.active,'boolean');assert.equal(typeof p.featured,'boolean');if(p.revision!==undefined)number(p.revision);}
   if(table==='variants'){const v=json(r.data);assert.equal(v.id,r.id);bounded(r.product_id,100);number(v.stock);number(v.price,100000000);if(v.originalPrice!==undefined)number(v.originalPrice,100000000);}
   if(table==='settings'){assert.equal(r.id,1);const s=json(r.data);number(s.shippingFee);number(s.freeShippingThreshold);assert.equal(typeof s.bankInfo,'string');}
   if(table==='orders'){const o=json(r.data);assert.equal(o.id,r.id);assert.equal(o.code,r.code);bounded(r.code,100);assert.match(r.token_hash,/^[0-9a-f]{64}$/);number(o.total);number(o.subtotal);number(o.shippingFee);assert.ok(['pending','confirmed','packing','shipping','delivered','cancelled'].includes(o.status));assert.ok(['unpaid','paid','refunded'].includes(o.paymentStatus));assert.ok(['cod','bank'].includes(o.paymentMethod));assert.ok(Array.isArray(o.items)&&o.items.length);assert.equal(typeof o.customer.name,'string');for(const i of o.items){number(i.price);number(i.quantity);bounded(i.variantId,100);}assert.ok(Number.isFinite(Date.parse(o.createdAt))&&Number.isFinite(Date.parse(o.updatedAt)));}
   if(table==='users'){bounded(r.email,254);bounded(r.name,100);bounded(r.password_hash,255);assert.ok(['owner','staff'].includes(r.role));}
   if(table==='sessions'){bounded(r.user_id,100);number(r.expires);}
   if(table==='idempotency'){assert.match(r.key,/^[A-Za-z0-9_-]{8,100}$/);assert.match(r.request_hash,/^[0-9a-f]{64}$/);const response=json(r.response);assert.equal(typeof response.trackingToken,'string');assert.ok(rows.orders.some(o=>o.id===response.order.id));}
   if(table==='order_receipts'){bounded(r.order_id,100);bounded(r.updated_at,32);}
   if(table==='audit'){bounded(r.action,100);bounded(r.created_at,32);JSON.parse(r.detail);}
  }catch(e){throw new Error(`${table} row ${i+1}: ${e.message}`);}
 }
 assert.equal(rows.settings.length,1,'Exactly one settings row is required');
 assert.ok(rows.users.some(u=>u.role==='owner'),'Source must contain an owner');
 const sql=['-- PRIVATE EXPORT. Back up target first. Import schema into an EMPTY database, then this file.','SET NAMES utf8mb4;','START TRANSACTION;',`SET @fillico_import_ok = (${Object.keys(expected).map(t=>`(SELECT COUNT(*) FROM \`${t}\`)=0`).join(' AND ')});`,"SELECT IF(@fillico_import_ok=1,'EMPTY TARGET: importing','STOP: target is not empty; no rows will be imported') AS migration_guard;"];
 const verification=['-- Run in phpMyAdmin BEFORE resetting passwords or serving traffic. All count_ok/content_ok must equal 1.','SET NAMES utf8mb4;'];
 for(const [table,columns] of Object.entries(expected)){
  let data=rows[table];if(table==='sessions'){manifest.revokedSessions=data.length;data=[];}
  const withSeq=['products','variants','orders','users'].includes(table);
  const cols=withSeq?['seq',...columns]:columns;
  const hashes=[];const sqlHashes=[];
  for(const r of data){const values=cols.map(c=>c==='seq'?r.__seq:r[c]);hashes.push(digest(JSON.stringify(values)));sqlHashes.push(digest(values.map(v=>v===null?'-':`${Buffer.byteLength(String(v),'utf8')}:${v}`).join('')));sql.push(`INSERT INTO \`${table}\` (${cols.map(c=>'`'+c+'`').join(',')}) SELECT ${values.map(sqlValue).join(',')} WHERE @fillico_import_ok=1;`);}
  const rowExpression=`SHA2(CONCAT(${cols.map(col=>`IF(\`${col}\` IS NULL,'-',CONCAT(OCTET_LENGTH(CAST(\`${col}\` AS BINARY)),':',CAST(\`${col}\` AS BINARY)))`).join(',')}),256)`;
  verification.push(`SELECT '${table}' AS table_name, COUNT(*)=${data.length} AS count_ok, COALESCE(SUM(${sqlHashes.length?rowExpression+' IN ('+sqlHashes.map(h=>"'"+h+"'").join(',')+')':'0'}),0)=${data.length} AS content_ok FROM \`${table}\`;`);
  manifest.tables[table]={columns:cols,count:data.length,hashes};
 }
 sql.push('COMMIT;');
 const uploadDir=join(dirname(path),'uploads');
 let entries=[];try{entries=await readdir(uploadDir);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(exporting)await mkdir(join(resolve(output),'uploads'),{mode:0o700});
 for(const name of entries){
  assert.match(name,/^[a-f0-9-]{36}\.(png|jpg|webp)$/,'Unexpected upload filename; review manually');const file=join(uploadDir,name);assert.ok((await lstat(file)).isFile()&&!(await lstat(file)).isSymbolicLink(),'Symlink/non-file upload rejected');
  const bytes=await readFile(file);manifest.uploads[name]=digest(bytes);if(exporting)await copyFile(file,join(resolve(output),'uploads',name));
 }
 const uploadLinks=new Set();for(const table of ['products','settings','orders'])for(const row of rows[table])for(const m of row.data.matchAll(/\/uploads\/([A-Za-z0-9_.-]+)/g))uploadLinks.add(m[1]);
 for(const name of uploadLinks)assert.ok(manifest.uploads[name],`Referenced upload missing (filename SHA256 ${digest(name)}). Restore uploads before migration.`);
 db.exec('COMMIT');db.close();db=null;
 const report={sourceCounts:counts,targetCounts:Object.fromEntries(Object.entries(manifest.tables).map(([k,v])=>[k,v.count])),uploadCount:entries.length,revokedSessions:manifest.revokedSessions,passwords:'All Node scrypt accounts require offline password reset. No plaintext passwords exported.',snapshot:exporting?'source-backup.sqlite':null};
 if(exporting){await writeFile(join(resolve(output),'data.sql'),sql.join('\n')+'\n',{mode:0o600,flag:'wx'});await writeFile(join(resolve(output),'verify.sql'),verification.join('\n')+'\n',{mode:0o600,flag:'wx'});await writeFile(join(resolve(output),'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});await writeFile(join(resolve(output),'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});}
 console.log(JSON.stringify(report,null,2));
}catch(e){console.error('Migration stopped:',e.message);console.error('No source data changed. Incomplete output, if present, must not be imported.');process.exitCode=1;}
finally{db?.close();}
