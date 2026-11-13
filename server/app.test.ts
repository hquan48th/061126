import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from './app.js';
import { Store, verifyPassword } from './store.js';
import type { Order, Product, Settings } from '../shared/types.js';
import { phpBackend } from '../tools/php-fixture.js';

const ownerEmail = 'admin@fillico.local';
const ownerPassword = 'TestPassword2026!';
const customer = {
  name: 'Khách kiểm thử',
  phone: '0901234567',
  email: 'test@example.com',
  address: '123 Đường Nguyễn Trãi, Phường Bến Thành, TP Hồ Chí Minh',
};

type StoreResponse = { products: Product[]; settings: Settings };
type OrderResponse = { order: Order; trackingToken: string };

async function fixture(t: TestContext) {
  let base: string, dataDir: string;
  if (process.env.FILLICO_TEST_BACKEND === 'php') {
    const backend = await phpBackend();
    base = backend.base; dataDir = backend.dataDir;
    t.after(backend.close);
  } else {
  dataDir = await mkdtemp(join(tmpdir(), 'fillico-api-test-'));
  const instance = await createApp({ dataDir, adminPassword: ownerPassword, serveFrontend: false });
  const server = instance.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await instance.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  }
  async function request(path: string, options: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { ...options.headers };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.cookie) headers.Cookie = options.cookie;
    return fetch(`${base}${path}`, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }
  async function login(email = ownerEmail, password = ownerPassword) {
    const response = await request('/api/auth/login', { body: { email, password } });
    assert.equal(response.status, 200, 'valid login should succeed');
    const cookie = response.headers.get('set-cookie');
    assert.ok(cookie, 'login must issue a session cookie');
    assert.match(cookie, /httponly/i);
    assert.match(cookie, /samesite=lax/i);
    return cookie.split(';')[0];
  }
  async function store(): Promise<StoreResponse> {
    const response = await request('/api/store');
    assert.equal(response.status, 200);
    return response.json() as Promise<StoreResponse>;
  }
  const initial = await store();
  const product = initial.products.find(item => item.active && item.variants.some(variant => variant.stock > 10));
  assert.ok(product, 'seed must include an available product');
  const variant = product.variants.find(item => item.stock > 10)!;
  const orderBody = (quantity = 1) => ({ items: [{ variantId: variant.id, quantity }], customer, paymentMethod: 'cod' });
  async function currentStock() {
    const data = await store();
    const current = data.products.flatMap(item => item.variants).find(item => item.id === variant.id);
    assert.ok(current);
    return current.stock;
  }
  async function createOrder(quantity = 1): Promise<OrderResponse> {
    const response = await request('/api/orders', { body: orderBody(quantity) });
    assert.ok(response.status === 201 || response.status === 200, `create order returned ${response.status}: ${await response.clone().text()}`);
    return response.json() as Promise<OrderResponse>;
  }
  return { request, login, store, product, variant, initial, orderBody, currentStock, createOrder, base, dataDir };
}

test('checkout prices come from the server and reserve inventory durably', async t => {
  const api = await fixture(t);
  const body = {
    ...api.orderBody(2),
    items: [{ variantId: api.variant.id, quantity: 2, price: 1 }],
    total: 1,
    subtotal: 1,
    shippingFee: 0,
    paymentStatus: 'paid',
  };
  const response = await api.request('/api/orders', { body });
  assert.ok(response.status === 201 || response.status === 200);
  const { order, trackingToken } = await response.json() as OrderResponse;
  const expectedSubtotal = api.variant.price * 2;
  const expectedShipping = expectedSubtotal >= api.initial.settings.freeShippingThreshold ? 0 : api.initial.settings.shippingFee;
  assert.equal(order.subtotal, expectedSubtotal);
  assert.equal(order.shippingFee, expectedShipping);
  assert.equal(order.total, expectedSubtotal + expectedShipping);
  assert.equal(order.items[0].price, api.variant.price);
  assert.equal(order.items[0].productName, api.product.name);
  assert.equal(order.paymentStatus, 'unpaid');
  assert.equal(order.status, 'pending');
  assert.equal(await api.currentStock(), api.variant.stock - 2);
  assert.ok(trackingToken.length >= 24, 'tracking secret should not be guessable');
});

test('checkout rejects zero, negative, fractional and string quantities without changing inventory', async t => {
  const api = await fixture(t);
  for (const quantity of [0, -1, 0.5, '2', null]) {
    const response = await api.request('/api/orders', {
      body: { ...api.orderBody(), items: [{ variantId: api.variant.id, quantity }] },
    });
    assert.equal(response.status, 400, `invalid quantity ${JSON.stringify(quantity)} should be rejected`);
  }
  assert.equal(await api.currentStock(), api.variant.stock);
});

test('checkout refuses overselling even when a variant is repeated in multiple lines', async t => {
  const api = await fixture(t);
  const response = await api.request('/api/orders', {
    body: {
      ...api.orderBody(),
      items: [
        { variantId: api.variant.id, quantity: api.variant.stock },
        { variantId: api.variant.id, quantity: 1 },
      ],
    },
  });
  assert.equal(response.status, 409);
  assert.equal(await api.currentStock(), api.variant.stock);
  const cookie = await api.login();
  const orders = await api.request('/api/admin/orders', { cookie });
  assert.equal((await orders.json() as { orders: Order[] }).orders.length, 0);
});

test('checkout rejects unavailable variants and unconfigured bank payment', async t => {
  const api = await fixture(t);
  const soldOut = api.initial.products.flatMap(item => item.variants).find(item => item.stock === 0);
  assert.ok(soldOut, 'seed should include an out-of-stock variant');
  const soldOutResponse = await api.request('/api/orders', {
    body: { ...api.orderBody(), items: [{ variantId: soldOut.id, quantity: 1 }] },
  });
  assert.equal(soldOutResponse.status, 409);
  assert.equal(api.initial.settings.bankInfo, '');
  const bankResponse = await api.request('/api/orders', { body: { ...api.orderBody(), paymentMethod: 'bank' } });
  assert.equal(bankResponse.status, 400);
  assert.equal(await api.currentStock(), api.variant.stock);
});

test('idempotent retry returns the original order and does not reserve stock twice', async t => {
  const api = await fixture(t);
  const headers = { 'Idempotency-Key': 'checkout-test-order-0001' };
  const first = await api.request('/api/orders', { body: api.orderBody(2), headers });
  assert.ok(first.status === 201 || first.status === 200);
  const original = await first.json() as OrderResponse;
  const retry = await api.request('/api/orders', { body: api.orderBody(2), headers });
  assert.ok(retry.status === 200 || retry.status === 201);
  const repeated = await retry.json() as OrderResponse;
  assert.equal(repeated.order.id, original.order.id);
  assert.equal(repeated.trackingToken, original.trackingToken);
  assert.equal(await api.currentStock(), api.variant.stock - 2);
  const conflict = await api.request('/api/orders', { body: api.orderBody(3), headers });
  assert.equal(conflict.status, 409, 'reusing an idempotency key for a different checkout is unsafe');
  assert.equal(await api.currentStock(), api.variant.stock - 2);
});

test('guest order lookup requires the secret tracking token', async t => {
  const api = await fixture(t);
  const { order, trackingToken } = await api.createOrder();
  for (const suffix of ['', '?token=wrong-token']) {
    const response = await api.request(`/api/orders/${encodeURIComponent(order.code)}${suffix}`);
    assert.ok(response.status >= 400 && response.status < 500);
    assert.doesNotMatch(await response.text(), new RegExp(customer.phone));
  }
  const valid = await api.request(`/api/orders/${encodeURIComponent(order.code)}?token=${encodeURIComponent(trackingToken)}`);
  assert.equal(valid.status, 200);
  const found = await valid.json() as { order: Order };
  assert.equal(found.order.id, order.id);
  assert.equal(found.order.customer.phone, customer.phone);
});

test('cancelling an order returns stock exactly once and cannot reopen the cancelled order', async t => {
  const api = await fixture(t);
  const { order } = await api.createOrder(3);
  const cookie = await api.login();
  const path = `/api/admin/orders/${order.id}`;
  const cancellation = await api.request(path, { method: 'PATCH', cookie, body: { status: 'cancelled' } });
  assert.equal(cancellation.status, 200);
  assert.equal((await cancellation.json() as { order: Order }).order.status, 'cancelled');
  assert.equal(await api.currentStock(), api.variant.stock);
  const retry = await api.request(path, { method: 'PATCH', cookie, body: { status: 'cancelled' } });
  assert.ok(retry.status === 200 || retry.status === 400 || retry.status === 409);
  assert.equal(await api.currentStock(), api.variant.stock);
  const reopen = await api.request(path, { method: 'PATCH', cookie, body: { status: 'confirmed' } });
  assert.equal(reopen.status, 400);
  assert.equal(await api.currentStock(), api.variant.stock);
});

test('order workflow rejects skipping directly from pending to delivered', async t => {
  const api = await fixture(t);
  const { order } = await api.createOrder();
  const cookie = await api.login();
  const response = await api.request(`/api/admin/orders/${order.id}`, {
    method: 'PATCH', cookie, body: { status: 'delivered' },
  });
  assert.equal(response.status, 400);
  const ordersResponse = await api.request('/api/admin/orders', { cookie });
  const orders = (await ordersResponse.json() as { orders: Order[] }).orders;
  assert.equal(orders.find(item => item.id === order.id)?.status, 'pending');
});

test('administrator endpoints require authentication and logout revokes the session', async t => {
  const api = await fixture(t);
  for (const path of ['/api/auth/me', '/api/admin/orders', '/api/admin/products', '/api/admin/settings', '/api/admin/staff']) {
    const response = await api.request(path);
    assert.equal(response.status, 401, path);
  }
  const cookie = await api.login();
  const me = await api.request('/api/auth/me', { cookie });
  assert.equal(me.status, 200);
  const userResponse = await me.json() as { user: { email: string; role: string } };
  assert.equal(userResponse.user.email, ownerEmail);
  assert.equal(userResponse.user.role, 'owner');
  const logout = await api.request('/api/auth/logout', { method: 'POST', cookie });
  assert.ok(logout.status === 200 || logout.status === 204);
  assert.equal((await api.request('/api/auth/me', { cookie })).status, 401);
});

test('staff can process orders but cannot mutate products, settings or staff accounts', async t => {
  const api = await fixture(t);
  const ownerCookie = await api.login();
  const email = 'staff@example.com';
  const password = 'StaffPassword2026!';
  const created = await api.request('/api/admin/staff', {
    cookie: ownerCookie, body: { name: 'Nhân viên kiểm thử', email, password },
  });
  assert.ok(created.status === 200 || created.status === 201, await created.clone().text());
  const staffCookie = await api.login(email, password);
  assert.equal((await api.request('/api/admin/orders', { cookie: staffCookie })).status, 200);
  assert.equal((await api.request('/api/admin/dashboard', { cookie: staffCookie })).status, 403);
  const { order } = await api.createOrder();
  assert.equal((await api.request(`/api/admin/orders/${order.id}`, {
    method: 'PATCH', cookie: staffCookie, body: { status: 'confirmed' },
  })).status, 200);
  for (const [path, method, body] of [
    ['/api/admin/products', 'POST', api.product],
    [`/api/admin/products/${api.product.id}`, 'PUT', { ...api.product, name: 'Unauthorized edit' }],
    [`/api/admin/products/${api.product.id}`, 'DELETE', undefined],
    ['/api/admin/settings', 'PUT', { ...api.initial.settings, storeName: 'Unauthorized edit' }],
    ['/api/admin/staff', 'POST', { name: 'Another staff', email: 'another@example.com', password }],
  ] as const) {
    const result = await api.request(path, { method, cookie: staffCookie, body });
    assert.equal(result.status, 403, `${method} ${path}`);
  }
  const after = await api.store();
  assert.equal(after.settings.storeName, api.initial.settings.storeName);
  assert.equal(after.products.find(item => item.id === api.product.id)?.name, api.product.name);
});

test('cross-origin mutations are rejected even with a valid owner session', async t => {
  const api = await fixture(t);
  const cookie = await api.login();
  const response = await api.request('/api/admin/settings', {
    method: 'PUT', cookie, body: { ...api.initial.settings, storeName: 'Attacker' },
    headers: { Origin: 'https://attacker.example' },
  });
  assert.equal(response.status, 403);
  assert.equal((await api.store()).settings.storeName, api.initial.settings.storeName);
});

test('login does not reveal whether an account exists', async t => {
  const api = await fixture(t);
  const known = await api.request('/api/auth/login', { body: { email: ownerEmail, password: 'wrong-password' } });
  const unknown = await api.request('/api/auth/login', { body: { email: 'missing@example.com', password: 'wrong-password' } });
  assert.equal(known.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await known.json(), await unknown.json());
});

test('failed multi-item checkout rolls back inventory already reserved earlier in the transaction', async t => {
  const api = await fixture(t);
  const response = await api.request('/api/orders', {
    body: { ...api.orderBody(), items: [{ variantId: api.variant.id, quantity: 2 }, { variantId: 'missing-variant', quantity: 1 }] },
  });
  assert.equal(response.status, 400);
  assert.equal(await api.currentStock(), api.variant.stock);
});

test('catalog edits cannot overwrite inventory changed by a concurrent checkout', async t => {
  const api = await fixture(t);
  const cookie = await api.login();
  await api.createOrder(2);
  const stale = await api.request(`/api/admin/products/${api.product.id}`, {
    method: 'PUT', cookie, body: { ...api.product, name: 'A stale product edit' },
  });
  assert.equal(stale.status, 409);
  assert.equal(await api.currentStock(), api.variant.stock - 2);
  const current = (await api.store()).products.find(p => p.id === api.product.id)!;
  const updated = await api.request(`/api/admin/products/${api.product.id}`, {
    method: 'PUT', cookie, body: { ...current, name: 'Tên sản phẩm mới' },
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json() as { product: Product }).product.revision, current.revision! + 1);
  assert.equal(await api.currentStock(), api.variant.stock - 2);
});

test('owner can create, edit and hide products while active orders retain their item snapshots', async t => {
  const api = await fixture(t);
  const cookie = await api.login();
  const draft = { ...api.product, id: undefined, revision: undefined, slug: 'san-pham-moi', name: 'Sản phẩm mới', variants: [{ ...api.variant, id: undefined, sku: 'NEW-001', stock: 10 }] };
  const createdResponse = await api.request('/api/admin/products', { cookie, body: draft });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json() as { product: Product }).product;
  const orderResponse = await api.request('/api/orders', { body: { ...api.orderBody(), items: [{ variantId: created.variants[0].id, quantity: 1 }] } });
  assert.equal(orderResponse.status, 201);
  const { order, trackingToken } = await orderResponse.json() as OrderResponse;
  const current = (await api.store()).products.find(p => p.id === created.id)!;
  const missingVariant = await api.request(`/api/admin/products/${created.id}`, { method: 'PUT', cookie, body: { ...current, variants: [{ ...current.variants[0], id: undefined, sku: 'NEW-002' }] } });
  assert.equal(missingVariant.status, 409, 'an active order must retain the variant needed for later cancellation');
  const hidden = await api.request(`/api/admin/products/${created.id}`, { method: 'DELETE', cookie });
  assert.equal(hidden.status, 200);
  assert.equal((await api.store()).products.some(p => p.id === created.id), false);
  const tracked = await api.request(`/api/orders/${order.code}?token=${trackingToken}`);
  assert.equal((await tracked.json() as { order: Order }).order.items[0].productName, created.name);
});

test('banner and company settings persist and bank checkout requires configured instructions', async t => {
  const api = await fixture(t);
  const cookie = await api.login();
  const settings = { ...api.initial.settings, heroTitle: 'Banner mới', heroEnabled: false, companyName: 'Công ty kiểm thử', bankInfo: 'Hướng dẫn chuyển khoản mẫu cho kiểm thử', freeShippingThreshold: 0 };
  const updated = await api.request('/api/admin/settings', { method: 'PUT', cookie, body: settings });
  assert.equal(updated.status, 200);
  assert.equal((await api.store()).settings.heroTitle, settings.heroTitle);
  assert.equal((await api.store()).settings.heroEnabled, false);
  const response = await api.request('/api/orders', { body: { ...api.orderBody(), paymentMethod: 'bank' } });
  assert.equal(response.status, 201);
  const { order } = await response.json() as OrderResponse;
  assert.equal(order.shippingFee, settings.shippingFee, 'zero threshold disables automatic free shipping');
  assert.equal(order.paymentStatus, 'unpaid');
});

test('image uploads validate content and cannot be used by staff', async t => {
  const api = await fixture(t);
  const cookie = await api.login();
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const response = await fetch(`${api.base}/api/admin/uploads`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'image/png' }, body: image });
  assert.equal(response.status, 201);
  const { url } = await response.json() as { url: string };
  assert.match(url, /^\/uploads\/[a-f0-9-]+\.png$/);
  const served = await fetch(api.base + url);
  assert.equal(served.status, 200);
  assert.match(served.headers.get('content-type') || '', /image\/png/);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), image);
  const invalid = await fetch(`${api.base}/api/admin/uploads`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'image/png' }, body: '<script>alert(1)</script>' });
  assert.equal(invalid.status, 400);
  const staffEmail = 'image-staff@example.com', staffPassword = 'StaffPassword2026!';
  await api.request('/api/admin/staff', { cookie, body: { name: 'Image staff', email: staffEmail, password: staffPassword } });
  const staffCookie = await api.login(staffEmail, staffPassword);
  const forbidden = await fetch(`${api.base}/api/admin/uploads`, { method: 'POST', headers: { Cookie: staffCookie, 'Content-Type': 'image/png' }, body: image });
  assert.equal(forbidden.status, 403);
});

test('password changes and staff removal revoke previously issued sessions', async t => {
  const api = await fixture(t);
  const cookie = await api.login();
  const secondSession = await api.login();
  const changed = await api.request('/api/auth/password', { cookie, body: { currentPassword: ownerPassword, password: 'NewPassword2026!' } });
  assert.equal(changed.status, 200);
  assert.equal((await api.request('/api/auth/me', { cookie })).status, 401);
  assert.equal((await api.request('/api/auth/me', { cookie: secondSession })).status, 401);
  const newCookie = await api.login(ownerEmail, 'NewPassword2026!');
  const staffEmail = 'removed@example.com', staffPassword = 'StaffPassword2026!';
  const created = await api.request('/api/admin/staff', { cookie: newCookie, body: { name: 'Removed staff', email: staffEmail, password: staffPassword } });
  const { user } = await created.json() as { user: { id: string } };
  const staffCookie = await api.login(staffEmail, staffPassword);
  const removed = await api.request(`/api/admin/staff/${user.id}`, { method: 'DELETE', cookie: newCookie });
  assert.equal(removed.status, 200);
  assert.equal((await api.request('/api/auth/me', { cookie: staffCookie })).status, 401);
});

test('paid orders require cancellation before refund and cancelled unpaid orders cannot be marked paid', async t => {
  const api = await fixture(t);
  const cookie = await api.login();
  const { order } = await api.createOrder();
  const path = `/api/admin/orders/${order.id}`;
  assert.equal((await api.request(path, { method: 'PATCH', cookie, body: { paymentStatus: 'refunded' } })).status, 400);
  assert.equal((await api.request(path, { method: 'PATCH', cookie, body: { paymentStatus: 'paid' } })).status, 200);
  assert.equal((await api.request(path, { method: 'PATCH', cookie, body: { paymentStatus: 'refunded' } })).status, 400);
  assert.equal((await api.request(path, { method: 'PATCH', cookie, body: { status: 'cancelled', paymentStatus: 'refunded' } })).status, 200);
  assert.equal(await api.currentStock(), api.variant.stock);
  const { order: unpaid } = await api.createOrder();
  const unpaidPath = `/api/admin/orders/${unpaid.id}`;
  assert.equal((await api.request(unpaidPath, { method: 'PATCH', cookie, body: { status: 'cancelled' } })).status, 200);
  assert.equal((await api.request(unpaidPath, { method: 'PATCH', cookie, body: { paymentStatus: 'paid' } })).status, 400);
});

test('SQLite persists stock and configuration across restarts and initial credentials are generated only once', { skip: process.env.FILLICO_TEST_BACKEND === 'php' ? 'SQLite baseline only; PHP persistence verified separately' : false }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'fillico-persistence-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const first = new Store(dir);
  const credentials = await readFile(join(dir, 'admin-credentials.txt'), 'utf8');
  const password = credentials.match(/^Password: (.+)$/m)?.[1];
  assert.ok(password && password.length >= 24);
  const owner = first.db.prepare('SELECT password_hash FROM users WHERE role=?').get('owner') as { password_hash: string };
  assert.equal(verifyPassword(password, owner.password_hash), true);
  const variant = first.products()[0].variants[0];
  first.transaction(() => { first.setStock(variant.id, 7); first.saveSettings({ ...first.settings(), companyName: 'Persistent company' }); });
  first.close();
  const second = new Store(dir);
  try {
    assert.equal(second.products()[0].variants[0].stock, 7);
    assert.equal(second.settings().companyName, 'Persistent company');
    assert.equal(await readFile(join(dir, 'admin-credentials.txt'), 'utf8'), credentials);
  } finally { second.close(); }
});

test('receipt edits are private, persisted per order, and do not change the order or inventory', async t => {
  const api = await fixture(t);
  const first = await api.createOrder(2);
  const second = await api.createOrder(1);
  const path = `/api/admin/orders/${first.order.id}/receipt`;
  assert.equal((await api.request(path)).status, 401);
  const owner = await api.login();
  assert.equal((await api.request(path, { cookie: owner })).status, 200);
  const content = 'PHIẾU BÁN HÀNG\nKhách: Nguyễn Văn A\nThêm ghi chú tùy ý\nTổng: 123.000 đ';
  const before = await api.currentStock();
  const response = await api.request(path, { method: 'PUT', cookie: owner, body: { content } });
  assert.equal(response.status, 200);
  const stored = await (await api.request(path, { cookie: owner })).json() as { receipt: { content: string } };
  assert.equal(stored.receipt.content, content);
  const other = await (await api.request(`/api/admin/orders/${second.order.id}/receipt`, { cookie: owner })).json() as { receipt: null };
  assert.equal(other.receipt, null);
  assert.equal((await api.request(`/api/admin/orders/nonexistent/receipt`, { cookie: owner })).status, 404);
  assert.equal((await api.request(path, { method: 'PUT', cookie: owner, body: { content: ' '.repeat(4) } })).status, 400);
  assert.equal(await api.currentStock(), before);
  const order = await (await api.request(`/api/orders/${first.order.code}?token=${first.trackingToken}`)).json() as { order: Order };
  assert.equal(order.order.total, first.order.total);
});

test('checkout rejects a changed total without reserving stock', async t => {
  const api = await fixture(t);
  const before = await api.currentStock();
  const response = await api.request('/api/orders', { body: { ...api.orderBody(), expectedTotal: 1 } });
  assert.equal(response.status, 409);
  assert.equal(await api.currentStock(), before);
});

test('private development data paths are blocked before static middleware', async t => {
  const api = await fixture(t);
  for (const path of ['/.local/admin-credentials.txt', '/.local/store.sqlite', '/@fs/tmp/store.sqlite']) {
    const response = await api.request(path);
    if (process.env.FILLICO_TEST_BACKEND === 'php') assert.ok([403,404].includes(response.status));
    else assert.equal(response.status, 404);
  }
});
