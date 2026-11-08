import express, { type Request, type Response, type NextFunction } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Store, hash, verifyPassword, passwordHash } from './store.js';
import type { Product, Variant, Settings, Order, User, Customer, OrderStatus, PaymentStatus } from '../shared/types.js';

type AuthRequest = Request & { user?: User };
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };
const text = (v: unknown, label: string, min = 0, max = 1000): string => {
 if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max) fail(400, `${label} không hợp lệ.`);
 return (v as string).trim();
};
const integer = (v: unknown, label: string, min = 0, max = 1000000000): number => {
 if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) fail(400, `${label} không hợp lệ.`);
 return v as number;
};
const object = (v: unknown): Record<string, any> => {
 if (!v || typeof v !== 'object' || Array.isArray(v)) fail(400, 'Dữ liệu không hợp lệ.');
 return v as Record<string, any>;
};
const email = (v: unknown, required = true) => {
 const value = text(v ?? '', 'Email', required ? 3 : 0, 254).toLowerCase();
 if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail(400, 'Email không hợp lệ.');
 return value;
};
const imagePath = (v: unknown) => {
 const value = text(v, 'Đường dẫn ảnh', 1, 2000);
 if (!/^\/(?:images|uploads)\/[A-Za-z0-9_./-]+$/.test(value) && !/^https:\/\/[^\s]+$/.test(value)) fail(400, 'Ảnh phải là đường dẫn nội bộ hoặc liên kết HTTPS.');
 if (value.includes('..')) fail(400, 'Đường dẫn ảnh không hợp lệ.');
 return value;
};
const publicUser = (u: any): User => ({ id: u.id, email: u.email, name: u.name, role: u.role });

export interface AppOptions { dataDir?: string; adminPassword?: string; serveFrontend?: boolean }
export async function createApp(options: AppOptions = {}) {
 const store = new Store(options.dataDir || process.env.DATA_DIR || resolve('.local'), options.adminPassword);
 const app = express();
 // Private application data must never be served by the development middleware.
 app.use((req, res, next) => {
  let path = req.path; try { path = decodeURIComponent(path); } catch { return res.sendStatus(400); }
  if (path.split(/[\\/]+/).includes('.local') || path.startsWith('/@fs/')) return res.sendStatus(404);
  next();
 });
 app.disable('x-powered-by');
 app.set('trust proxy', 'loopback');
 app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); next(); });
 app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
   const origin = req.get('origin');
   if (origin) { try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({error:'Yêu cầu từ nguồn không được phép.'}); } catch { return res.status(403).json({error:'Nguồn yêu cầu không hợp lệ.'}); } }
   if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({error:'Yêu cầu từ nguồn không được phép.'});
   const emptyLogout = req.path === '/auth/logout' && !req.get('transfer-encoding') && (!req.get('content-length') || req.get('content-length') === '0');
   if (!req.path.startsWith('/admin/uploads') && !emptyLogout && req.method !== 'DELETE' && !req.is('application/json')) return res.status(415).json({error:'Yêu cầu cần dữ liệu JSON.'});
  }
  next();
 });
 app.use(express.json({ limit: '1mb' }));
 const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const cookie = req.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('fillico_session='))?.slice(16);
  if (!cookie || !/^[A-Za-z0-9_-]{40,100}$/.test(cookie)) return res.status(401).json({error:'Vui lòng đăng nhập.'});
  const row = store.db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>?').get(hash(cookie), Date.now());
  if (!row) return res.status(401).json({error:'Phiên đăng nhập đã hết hạn.'});
  req.user = publicUser(row); next();
 };
 const owner = (req: AuthRequest, res: Response, next: NextFunction) => req.user?.role === 'owner' ? next() : res.status(403).json({error:'Chỉ chủ cửa hàng được sử dụng chức năng này.'});
 app.get('/api/health', (_req, res) => res.json({status:'ok'}));
 app.get('/api/store', (_req, res) => res.json({products:store.products(true),settings:store.settings()}));
 const loginAttempts = new Map<string, {count:number; until:number}>();
 app.post('/api/auth/login', (req, res) => {
  const data = object(req.body); const loginEmail = email(data.email); const password = text(data.password, 'Mật khẩu', 1, 200);
  const attemptKey = `${req.ip}`; const attempt = loginAttempts.get(attemptKey);
  if (attempt && attempt.until > Date.now() && attempt.count >= 12) { res.setHeader('Retry-After', Math.ceil((attempt.until-Date.now())/1000)); return res.status(429).json({error:'Quá nhiều lần đăng nhập. Vui lòng thử lại sau 15 phút.'}); }
  if (loginAttempts.size > 10000) for (const [key, value] of loginAttempts) if (value.until <= Date.now()) loginAttempts.delete(key);
  const user = store.db.prepare('SELECT * FROM users WHERE email=?').get(loginEmail) as any;
  const dummyHash = '00112233445566778899aabbccddeeff:' + '0'.repeat(128);
  const valid = verifyPassword(password, user?.password_hash || dummyHash);
  if (!user || !valid) {
   loginAttempts.set(attemptKey, {count:attempt && attempt.until > Date.now() ? attempt.count+1 : 1,until:attempt && attempt.until > Date.now() ? attempt.until : Date.now()+15*60000});
   return res.status(401).json({error:'Email hoặc mật khẩu không chính xác.'});
  }
  loginAttempts.delete(attemptKey);
  const token = randomBytes(32).toString('base64url');
  store.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),user.id,Date.now()+7*86400000);
  res.cookie('fillico_session',token,{httpOnly:true,sameSite:'lax',secure:req.secure,maxAge:7*86400000,path:'/'});
  store.audit(publicUser(user), 'login', {}); res.json({user:publicUser(user)});
 });
 app.get('/api/auth/me', authenticate, (req: AuthRequest, res) => res.json({user:req.user}));
 app.post('/api/auth/logout', authenticate, (req, res) => {
  const cookie = req.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('fillico_session='))?.slice(16);
  if(cookie) store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(cookie));
  res.clearCookie('fillico_session',{httpOnly:true,sameSite:'lax',secure:req.secure,path:'/'});res.json({ok:true});
 });
 app.post('/api/auth/password', authenticate, (req: AuthRequest,res) => {
  const data=object(req.body); const current=text(data.currentPassword,'Mật khẩu hiện tại',1,200);const password=text(data.password,'Mật khẩu mới',12,200);
  const row=store.db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user!.id) as {password_hash:string};
  if(!verifyPassword(current,row.password_hash)) fail(400,'Mật khẩu hiện tại không chính xác.');
  store.transaction(()=>{store.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash(password),req.user!.id);store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.user!.id);store.audit(req.user,'password.change',{});});
  res.clearCookie('fillico_session',{httpOnly:true,sameSite:'lax',secure:req.secure,path:'/'});res.json({ok:true});
 });
 app.post('/api/orders', (req, res) => {
  const input = object(req.body); const customerInput = object(input.customer);
  const customer: Customer = {name:text(customerInput.name,'Họ tên',2,100),phone:text(customerInput.phone,'Số điện thoại',9,20),email:email(customerInput.email,false),address:text(customerInput.address,'Địa chỉ',10,500),note:text(customerInput.note??'','Ghi chú',0,1000)};
  if (!/^(?:\+84|0)[0-9 .()-]{8,15}$/.test(customer.phone)) fail(400,'Số điện thoại không hợp lệ.');
  if (!['cod','bank'].includes(input.paymentMethod)) fail(400,'Phương thức thanh toán không hợp lệ.');
  if (!Array.isArray(input.items) || input.items.length<1 || input.items.length>100) fail(400,'Giỏ hàng cần từ 1 đến 100 sản phẩm.');
  const quantities = new Map<string,number>();
  for (const itemInput of input.items) { const item=object(itemInput);const id=text(item.variantId,'Phân loại',1,100); const q=integer(item.quantity,'Số lượng',1,999);quantities.set(id,(quantities.get(id)||0)+q);if(quantities.get(id)!>999) fail(400,'Số lượng tối đa là 999 mỗi phân loại.'); }
  const requestHash = hash(JSON.stringify({customer,items:[...quantities].sort(([a],[b])=>a.localeCompare(b)),paymentMethod:input.paymentMethod}));
  const key = req.get('idempotency-key');if(key && !/^[a-zA-Z0-9_-]{8,100}$/.test(key)) fail(400,'Mã yêu cầu không hợp lệ.');
  const result = store.transaction(() => {
   if(key){ const saved=store.db.prepare('SELECT * FROM idempotency WHERE key=?').get(key) as any;if(saved){if(saved.request_hash!==requestHash) fail(409,'Mã yêu cầu đã dùng cho một đơn hàng khác.');return JSON.parse(saved.response);} }
   const settings=store.settings();if(input.paymentMethod==='bank'&&!settings.bankInfo.trim()) fail(400,'Cửa hàng chưa cấu hình thanh toán chuyển khoản.');
   const products=store.products(true);
   const items=[...quantities].map(([id,quantity])=>{
    const product=products.find(p=>p.variants.some(v=>v.id===id));const variant=product?.variants.find(v=>v.id===id);
    if(!product||!variant) return fail(400,'Sản phẩm không còn được bán.');
    if(quantity>variant.stock) return fail(409,`${product.name} — ${variant.name} chỉ còn ${variant.stock} sản phẩm.`);
    store.setStock(id,variant.stock-quantity);
    return {variantId:id,productName:product.name,variantName:variant.name,image:product.image,sku:variant.sku,price:variant.price,quantity};
   });
   const subtotal=items.reduce((n,i)=>n+i.price*i.quantity,0);
   const shippingFee=settings.freeShippingThreshold>0 && subtotal>=settings.freeShippingThreshold ? 0 : settings.shippingFee;
   if(input.expectedTotal !== undefined && input.expectedTotal !== subtotal+shippingFee) fail(409,'Giá hoặc phí vận chuyển đã thay đổi. Vui lòng kiểm tra lại tổng tiền trước khi đặt hàng.');
   const timestamp=new Date().toISOString();const token=randomBytes(32).toString('base64url');
   const order:Order={id:randomUUID(),code:`FL${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString('hex').toUpperCase()}`,customer,items,subtotal,shippingFee,total:subtotal+shippingFee,paymentMethod:input.paymentMethod,status:'pending',paymentStatus:'unpaid',createdAt:timestamp,updatedAt:timestamp};
   store.saveOrder(order,token);const response={order,trackingToken:token};
   if(key)store.db.prepare('INSERT INTO idempotency VALUES(?,?,?)').run(key,requestHash,JSON.stringify(response));
   store.audit(undefined,'order.create',{id:order.id,code:order.code});return response;
  });
  res.status(201).json(result);
 });
 app.get('/api/orders/:code', (req,res)=>{
  const token=typeof req.query.token==='string'?req.query.token:'';
  const row=store.db.prepare('SELECT data FROM orders WHERE code=? AND token_hash=?').get(req.params.code,hash(token)) as {data:string}|undefined;
  if(!row) return res.status(404).json({error:'Không tìm thấy đơn hàng hoặc mã tra cứu không đúng.'});
  res.json({order:JSON.parse(row.data)});
 });
 app.use('/api/admin',authenticate);
 app.get('/api/admin/dashboard',owner,(_req,res)=>{
  const orders=store.orders();res.json({summary:{totalOrders:orders.length,pendingOrders:orders.filter(o=>o.status==='pending').length,revenue:orders.filter(o=>o.paymentStatus==='paid'&&o.status!=='cancelled').reduce((n,o)=>n+o.total,0),lowStockProducts:store.products(true).filter(p=>p.variants.some(v=>v.stock<10)).length},recentOrders:orders.slice(0,6)});
 });
 app.get('/api/admin/orders',(_req,res)=>res.json({orders:store.orders()}));
 app.get('/api/admin/orders/:id/receipt',(req,res)=>{
  const id=String(req.params.id);if(!store.order(id))return res.status(404).json({error:'Không tìm thấy đơn hàng.'});
  const row=store.db.prepare('SELECT content,updated_at FROM order_receipts WHERE order_id=?').get(id) as {content:string;updated_at:string}|undefined;
  res.json({receipt:row?{content:row.content,updatedAt:row.updated_at}:null});
 });
 app.put('/api/admin/orders/:id/receipt',(req:AuthRequest,res)=>{
  const id=String(req.params.id);if(!store.order(id))return res.status(404).json({error:'Không tìm thấy đơn hàng.'});
  const data=object(req.body);const content=text(data.content,'Nội dung phiếu',1,30000);const updatedAt=new Date().toISOString();
  store.transaction(()=>{store.db.prepare('INSERT INTO order_receipts(order_id,content,updated_at) VALUES(?,?,?) ON CONFLICT(order_id) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at').run(id,content,updatedAt);store.audit(req.user,'receipt.update',{orderId:id});});
  res.json({receipt:{content,updatedAt}});
 });
 const transitions:Record<OrderStatus,OrderStatus[]>={pending:['confirmed','cancelled'],confirmed:['packing','cancelled'],packing:['shipping','cancelled'],shipping:['delivered'],delivered:[],cancelled:[]};
 app.patch('/api/admin/orders/:id',(req:AuthRequest,res)=>{
  const data=object(req.body);const order=store.transaction(()=>{
   const current=store.order(String(req.params.id));if(!current)return fail(404,'Không tìm thấy đơn hàng.');
   const status=(data.status??current.status) as OrderStatus;
   if(status!==current.status&&!transitions[current.status].includes(status))fail(400,'Không thể chuyển sang trạng thái đơn hàng này.');
   const paymentStatus=(data.paymentStatus??current.paymentStatus) as PaymentStatus;
   if(!['unpaid','paid','refunded'].includes(paymentStatus))fail(400,'Trạng thái thanh toán không hợp lệ.');
   if(status==='cancelled'&&current.paymentStatus==='unpaid'&&paymentStatus==='paid')fail(400,'Không thể ghi nhận thanh toán cho đơn đã hủy.');
   if(current.paymentStatus==='paid'&&paymentStatus==='unpaid'||current.paymentStatus==='refunded'&&paymentStatus!=='refunded')fail(400,'Không thể chuyển ngược trạng thái thanh toán.');
   if(paymentStatus==='refunded'&&(current.paymentStatus!=='paid'&&current.paymentStatus!=='refunded'||status!=='cancelled'))fail(400,'Chỉ hoàn tiền cho đơn đã thanh toán và đã hủy.');
   if(status==='cancelled'&&current.status!=='cancelled'){
    const variants=store.products().flatMap(p=>p.variants);
    for(const item of current.items){const variant=variants.find(v=>v.id===item.variantId);if(variant)store.setStock(variant.id,variant.stock+item.quantity);}
   }
   const updated={...current,status,paymentStatus,updatedAt:new Date().toISOString()};store.saveOrder(updated);store.audit(req.user,'order.update',{id:current.id,from:current.status,to:status,paymentStatus});return updated;
  });res.json({order});
 });
 app.get('/api/admin/products',owner,(_req,res)=>res.json({products:store.products()}));
 const validateProduct = (input:unknown,id:string,previous?:Product):Product=>{
  const d=object(input);
  if(previous && d.revision !== previous.revision)fail(409,'Sản phẩm hoặc tồn kho đã thay đổi. Vui lòng tải lại trước khi chỉnh sửa.');
  if(!Array.isArray(d.variants)||d.variants.length<1||d.variants.length>50)fail(400,'Sản phẩm cần từ 1 đến 50 phân loại.');
  const seen=new Set<string>();const skuSet=new Set<string>();
  const variants:Variant[]=d.variants.map((value:unknown)=>{
   const v=object(value);const variantId=v.id?text(v.id,'Mã phân loại',1,100):randomUUID();if(seen.has(variantId))fail(400,'Mã phân loại bị trùng.');seen.add(variantId);
   const other=store.db.prepare('SELECT product_id FROM variants WHERE id=?').get(variantId) as {product_id:string}|undefined;if(other&&other.product_id!==id)fail(400,'Phân loại thuộc sản phẩm khác.');
   const sku=text(v.sku,'SKU',1,100);if(skuSet.has(sku))fail(400,'SKU bị trùng trong sản phẩm.');skuSet.add(sku);
   const price=integer(v.price,'Giá',1000,100000000);const original=v.originalPrice==null?undefined:integer(v.originalPrice,'Giá gốc',0,100000000);
   if(original!==undefined&&original!==0&&original<price)fail(400,'Giá gốc phải lớn hơn hoặc bằng giá bán.');
   return {id:variantId,name:text(v.name,'Tên phân loại',1,100),sku,price,stock:integer(v.stock,'Tồn kho',0,1000000),...(original?{originalPrice:original}:{})};
  });
  if(previous){
   const removed=previous.variants.filter(v=>!seen.has(v.id));
   if(removed.some(v=>store.orders().some(o=>!['cancelled','delivered'].includes(o.status)&&o.items.some(i=>i.variantId===v.id))))fail(409,'Không thể xóa phân loại đang có đơn hàng chưa hoàn tất.');
  }
  const slug=text(d.slug,'Đường dẫn',1,160);if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))fail(400,'Đường dẫn chỉ gồm chữ thường, số và dấu gạch ngang.');
  const duplicate=store.db.prepare('SELECT id FROM products WHERE slug=? AND id<>?').get(slug,id);if(duplicate)fail(409,'Đường dẫn sản phẩm đã tồn tại.');
  if(typeof d.featured!=='boolean'||typeof d.active!=='boolean')fail(400,'Trạng thái sản phẩm không hợp lệ.');
  const images=d.images===undefined?undefined:Array.isArray(d.images)&&d.images.length<=12?d.images.map(imagePath):fail(400,'Tối đa 12 ảnh mỗi sản phẩm.');
  return {id,slug,name:text(d.name,'Tên sản phẩm',2,200),category:text(d.category,'Danh mục',1,100),description:text(d.description,'Mô tả',0,10000),image:imagePath(d.image),images,badge:text(d.badge??'','Nhãn',0,50),featured:d.featured,active:d.active,variants,revision:(previous?.revision ?? 0)+1};
 };
 app.post('/api/admin/products',owner,(req:AuthRequest,res)=>{
  const product=store.transaction(()=>{const p=validateProduct(req.body,randomUUID());store.saveProduct(p);store.audit(req.user,'product.create',{id:p.id});return p;});res.status(201).json({product});
 });
 app.put('/api/admin/products/:id',owner,(req:AuthRequest,res)=>{
  const product=store.transaction(()=>{const previous=store.product(String(req.params.id));if(!previous)return fail(404,'Không tìm thấy sản phẩm.');const p=validateProduct(req.body,previous.id,previous);store.saveProduct(p);store.audit(req.user,'product.update',{id:p.id});return p;});res.json({product});
 });
 app.delete('/api/admin/products/:id',owner,(req:AuthRequest,res)=>{
  store.transaction(()=>{const p=store.product(String(req.params.id));if(!p)return fail(404,'Không tìm thấy sản phẩm.');store.saveProduct({...p,active:false,revision:(p.revision??1)+1});store.audit(req.user,'product.archive',{id:p.id});});res.json({ok:true});
 });
 app.get('/api/admin/settings',owner,(_req,res)=>res.json({settings:store.settings()}));
 app.put('/api/admin/settings',owner,(req:AuthRequest,res)=>{
  const d=object(req.body);const existing=store.settings();const merged={...existing,...d};
  const settings:Settings={storeName:text(merged.storeName,'Tên cửa hàng',1,100),tagline:text(merged.tagline,'Khẩu hiệu',0,200),phone:text(merged.phone,'Điện thoại',0,30),email:email(merged.email,false),address:text(merged.address,'Địa chỉ',0,500),companyName:text(merged.companyName,'Tên công ty',0,200),taxCode:text(merged.taxCode,'Mã số thuế',0,30),heroTitle:text(merged.heroTitle,'Tiêu đề banner',1,200),heroSubtitle:text(merged.heroSubtitle,'Mô tả banner',0,1000),heroImage:imagePath(merged.heroImage),heroEnabled:merged.heroEnabled,shippingFee:integer(merged.shippingFee,'Phí giao hàng',0,10000000),freeShippingThreshold:integer(merged.freeShippingThreshold,'Ngưỡng miễn phí vận chuyển',0,1000000000),bankInfo:text(merged.bankInfo,'Thông tin chuyển khoản',0,2000)};
  if(typeof settings.heroEnabled!=='boolean')fail(400,'Trạng thái banner không hợp lệ.');
  if(merged.policies!==undefined){const policies=object(merged.policies);if(Object.keys(policies).length>20)fail(400,'Tối đa 20 chính sách.');settings.policies={};for(const [key,value]of Object.entries(policies)){if(!/^[a-z0-9-]{1,80}$/.test(key))fail(400,'Mã chính sách không hợp lệ.');settings.policies[key]=text(value,'Nội dung chính sách',0,20000);}}
  store.transaction(()=>{store.saveSettings(settings);store.audit(req.user,'settings.update',{});});res.json({settings});
 });
 const uploadDir=join(store.dataDir,'uploads');mkdirSync(uploadDir,{recursive:true,mode:0o700});
 app.post('/api/admin/uploads',owner,express.raw({type:['image/jpeg','image/png','image/webp'],limit:'5mb'}),(req:AuthRequest,res)=>{
  const bytes=req.body;if(!Buffer.isBuffer(bytes)||bytes.length<12)fail(400,'Ảnh không hợp lệ.');
  const mime=req.get('content-type')?.split(';')[0];const extension=mime==='image/png'?'png':mime==='image/jpeg'?'jpg':mime==='image/webp'?'webp':null;
  const valid=extension==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):extension==='jpg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:extension==='webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':false;
  if(!valid)fail(400,'Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP hợp lệ.');
  const filename=`${randomUUID()}.${extension}`;writeFileSync(join(uploadDir,filename),bytes,{flag:'wx',mode:0o600});store.audit(req.user,'image.upload',{filename});res.status(201).json({url:`/uploads/${filename}`});
 });
 app.use('/uploads',express.static(uploadDir,{maxAge:'7d',index:false,dotfiles:'deny'}));
 app.get('/api/admin/staff',owner,(_req,res)=>res.json({staff:store.db.prepare('SELECT id,name,email,role FROM users ORDER BY rowid').all()}));
 app.post('/api/admin/staff',owner,(req:AuthRequest,res)=>{
  const d=object(req.body);const user:User={id:randomUUID(),name:text(d.name,'Họ tên',2,100),email:email(d.email),role:'staff'};const password=text(d.password,'Mật khẩu',12,200);
  if(store.db.prepare('SELECT id FROM users WHERE email=?').get(user.email))fail(409,'Email đã tồn tại.');
  store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(user.id,user.email,user.name,user.role,passwordHash(password));store.audit(req.user,'staff.create',{id:user.id});res.status(201).json({user});
 });
 app.delete('/api/admin/staff/:id',owner,(req:AuthRequest,res)=>{
  const user=store.db.prepare('SELECT role FROM users WHERE id=?').get(String(req.params.id)) as {role:string}|undefined;if(!user)fail(404,'Không tìm thấy nhân viên.');if(user!.role==='owner')fail(400,'Không thể xóa tài khoản chủ cửa hàng.');
  store.transaction(()=>{store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(String(req.params.id));store.db.prepare('DELETE FROM users WHERE id=?').run(String(req.params.id));store.audit(req.user,'staff.delete',{id:req.params.id});});res.json({ok:true});
 });
 app.use('/api',(_req,res)=>res.status(404).json({error:'Không tìm thấy API.'}));
 app.use((error: any,_req:Request,res:Response,_next:NextFunction)=>{
  if(error instanceof HttpError)return res.status(error.status).json({error:error.message});
  if(error.type==='entity.too.large')return res.status(413).json({error:'Dữ liệu tải lên vượt kích thước cho phép.'});
  if(error instanceof SyntaxError&&'body' in error)return res.status(400).json({error:'Dữ liệu JSON không hợp lệ.'});
  console.error('Server error:',error instanceof Error?error.message:'Unknown error');res.status(500).json({error:'Có lỗi xử lý. Vui lòng thử lại.'});
 });
 let vite: {close:()=>Promise<void>}|undefined;
 if(options.serveFrontend!==false){
  if(process.env.NODE_ENV==='production'){
   const dist=resolve('dist');app.use(express.static(dist,{index:false}));app.get('/{*path}',(_req,res)=>res.sendFile(join(dist,'index.html')));
  }else{
   const {createServer}=await import('vite');const server=await createServer({server:{middlewareMode:true},appType:'spa'});vite=server;app.use(server.middlewares);
  }
 }
 return {app,store,close:async()=>{await vite?.close();store.close();}};
}
