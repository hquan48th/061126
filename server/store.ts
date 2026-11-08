import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { defaultSettings, seedProducts } from './seed.js';
import type { Product, Settings, Order, User } from '../shared/types.js';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function passwordHash(password: string) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
export function verifyPassword(password: string, saved: string) { const [salt, key] = saved.split(':'); const computed = scryptSync(password, salt, 64); const expected = Buffer.from(key, 'hex'); return expected.length === computed.length && timingSafeEqual(computed, expected); }
export class Store {
 db: DatabaseSync;
 constructor(public dataDir: string, adminPassword?: string) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = join(dataDir, 'store.sqlite'); this.db = new DatabaseSync(file); chmodSync(file, 0o600);
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS variants(id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, token_hash TEXT NOT NULL, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS order_receipts(order_id TEXT PRIMARY KEY REFERENCES orders(id), content TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS idempotency(key TEXT PRIMARY KEY, request_hash TEXT NOT NULL, response TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);`);
  if (!this.db.prepare('SELECT id FROM settings WHERE id=1').get()) this.db.prepare('INSERT INTO settings VALUES(1,?)').run(JSON.stringify(defaultSettings));
  if (!this.db.prepare('SELECT id FROM products LIMIT 1').get()) this.transaction(() => seedProducts.forEach(product => this.saveProduct(product)));
  if (!this.db.prepare('SELECT id FROM users LIMIT 1').get()) {
   const password = adminPassword || randomBytes(18).toString('base64url');
   this.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(randomUUID(), 'admin@fillico.local', 'Chủ cửa hàng', 'owner', passwordHash(password));
   if (!adminPassword) writeFileSync(join(dataDir, 'admin-credentials.txt'), `Email: admin@fillico.local\nPassword: ${password}\n\nThông tin truy cập quản trị cục bộ. Không chia sẻ hoặc đưa tệp này vào Git. Đổi mật khẩu trong trang quản trị trước khi mở bán.\n`, { mode: 0o600, flag: 'wx' });
  }
 }
 transaction<T>(fn: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
 products(activeOnly = false): Product[] {
  return (this.db.prepare('SELECT data FROM products ORDER BY rowid').all() as {data:string}[]).map(row => {
   const p = JSON.parse(row.data) as Product;
   p.revision ??= 1;
   p.variants = (this.db.prepare('SELECT data FROM variants WHERE product_id=? ORDER BY rowid').all(p.id) as {data:string}[]).map(v => JSON.parse(v.data));
   return p;
  }).filter(p => !activeOnly || p.active);
 }
 product(id: string) { return this.products().find(p => p.id === id); }
 saveProduct(product: Product) {
  const { variants, ...data } = product;
  data.revision ??= 1;
  this.db.prepare('INSERT INTO products(id,slug,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,data=excluded.data').run(product.id, product.slug, JSON.stringify(data));
  const existing = this.db.prepare('SELECT id FROM variants WHERE product_id=?').all(product.id) as {id:string}[];
  for (const variant of variants) {
   const other = this.db.prepare('SELECT product_id FROM variants WHERE id=?').get(variant.id) as {product_id:string}|undefined;
   if (other && other.product_id !== product.id) throw new Error('Variant belongs to another product');
   this.db.prepare('INSERT INTO variants(id,product_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(variant.id, product.id, JSON.stringify(variant));
  }
  for (const old of existing) if (!variants.some(v => v.id === old.id)) this.db.prepare('DELETE FROM variants WHERE id=?').run(old.id);
 }
 setStock(id: string, stock: number) {
  const row = this.db.prepare('SELECT data,product_id FROM variants WHERE id=?').get(id) as {data:string;product_id:string}|undefined;
  if (!row) return;
  const variant = JSON.parse(row.data); variant.stock = stock;
  this.db.prepare('UPDATE variants SET data=? WHERE id=?').run(JSON.stringify(variant), id);
  const productRow = this.db.prepare('SELECT data FROM products WHERE id=?').get(row.product_id) as {data:string};
  const product = JSON.parse(productRow.data); product.revision = (product.revision ?? 1) + 1;
  this.db.prepare('UPDATE products SET data=? WHERE id=?').run(JSON.stringify(product),row.product_id);
 }
 settings(): Settings { return JSON.parse((this.db.prepare('SELECT data FROM settings WHERE id=1').get() as {data:string}).data); }
 saveSettings(settings: Settings) { this.db.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify(settings)); }
 orders(): Order[] { return (this.db.prepare('SELECT data FROM orders ORDER BY rowid DESC').all() as {data:string}[]).map(r => JSON.parse(r.data)); }
 order(id: string): Order | undefined { const row = this.db.prepare('SELECT data FROM orders WHERE id=?').get(id) as {data:string}|undefined; return row ? JSON.parse(row.data) : undefined; }
 saveOrder(order: Order, token?: string) {
  if (token) this.db.prepare('INSERT INTO orders(id,code,token_hash,data) VALUES(?,?,?,?)').run(order.id, order.code, hash(token), JSON.stringify(order));
  else this.db.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(order), order.id);
 }
 audit(user: User | undefined, action: string, detail: unknown) { this.db.prepare('INSERT INTO audit(user_id,action,detail,created_at) VALUES(?,?,?,?)').run(user?.id || null, action, JSON.stringify(detail), new Date().toISOString()); }
 close() { this.db.close(); }
}
