import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaultSettings, seedProducts } from '../server/seed.js';
import { resolve } from 'node:path';

// Hard-wired to the DISPOSABLE Docker test database. No production credentials accepted.
export function testSql(sql: string) {
  return execFileSync('docker',['exec','-i','fillico-db','mariadb','-uroot','-pisolated-test-root','--batch','fillico_test'],{input:sql,encoding:'utf8'});
}
const hex=(s:string)=>`CONVERT(0x${Buffer.from(s).toString('hex')} USING utf8mb4)`;
export async function phpBackend() {
  if(process.env.FILLICO_TEST_BACKEND!=='php')throw new Error('PHP tests must be explicitly selected');
  const dataDir=await mkdtemp(join(tmpdir(),'fillico-php-fixture-'));
  const sql=['SET FOREIGN_KEY_CHECKS=0;',...['sessions','users','order_receipts','orders','idempotency','variants','products','settings','audit','login_attempts'].map(t=>`TRUNCATE TABLE \`${t}\`;`),'SET FOREIGN_KEY_CHECKS=1;',`INSERT INTO settings VALUES(1,${hex(JSON.stringify(defaultSettings))});`];
  for(const p of seedProducts){const {variants,...data}=p;sql.push(`INSERT INTO products(id,slug,data) VALUES(${hex(p.id)},${hex(p.slug)},${hex(JSON.stringify({...data,revision:1}))});`);for(const v of variants)sql.push(`INSERT INTO variants(id,product_id,data) VALUES(${hex(v.id)},${hex(p.id)},${hex(JSON.stringify(v))});`);}
  const password='TestPassword2026!';
  const hash=execFileSync('docker',['exec','-i','fillico-web','php','-r',"echo password_hash(trim(stream_get_contents(STDIN)), PASSWORD_ARGON2ID, ['memory_cost'=>19456,'time_cost'=>2,'threads'=>1]);"],{input:password,encoding:'utf8'});
  sql.push(`INSERT INTO users(id,email,name,role,password_hash) VALUES('test-owner','admin@fillico.local','Chủ cửa hàng','owner',${hex(hash)});`);
  testSql(sql.join('\n'));
  await writeFile(join(dataDir,'admin-credentials.txt'),`Email: admin@fillico.local\nPassword: ${password}\n`,{mode:0o600});
  return {base:'http://127.0.0.1:3101',dataDir,sandbox:resolve(process.env.FILLICO_PHP_SANDBOX||'work/php-sandbox'),close:()=>rm(dataDir,{recursive:true,force:true})};
}
