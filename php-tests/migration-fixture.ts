import { createApp } from '../server/app.js';
import { hash } from '../server/store.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Synthetic data only, never reads .local or any real customer records.
const dataDir=process.argv[2];if(!dataDir)throw new Error('synthetic fixture directory required');
const app=await createApp({dataDir,adminPassword:'LegacyPassword2026!',serveFrontend:false});
const server=app.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
const address=server.address() as any;const base=`http://127.0.0.1:${address.port}`;
const imageName='01234567-89ab-4cde-8f01-23456789abcd.png';
mkdirSync(join(dataDir,'uploads'),{recursive:true});writeFileSync(join(dataDir,'uploads',imageName),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64'));
const p=app.store.product('p1')!;p.image='/uploads/'+imageName;p.variants[0].id='0';app.store.saveProduct(p);
const body={customer:{name:'Khách dữ liệu giả 😀',phone:'0901234567',email:'synthetic@example.com',address:'123 Địa chỉ giả cho chuyển đổi',note:"Dòng 1\nDòng 2 ' \\"},items:[{variantId:'0',quantity:2}],paymentMethod:'cod'};
const r=await fetch(base+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'legacy-retry-fixture'},body:JSON.stringify(body)});if(r.status!==201)throw new Error(await r.text());const placed=await r.json() as any;
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@fillico.local',password:'LegacyPassword2026!'})});const legacyCookie=login.headers.get('set-cookie')!.split(';')[0];
app.store.db.prepare('INSERT INTO order_receipts VALUES(?,?,?)').run(placed.order.id,'PHIẾU CŨ\nGhi chú giả 😀\nTổng: 210.000 đ','2026-11-01T01:02:03.004Z');
writeFileSync(join(dataDir,'expected.json'),JSON.stringify({body,placed,legacyCookie,ownerId:(app.store.db.prepare("SELECT id FROM users WHERE role='owner'").get() as any).id}));
await new Promise<void>(r=>server.close(()=>r()));await app.close();
