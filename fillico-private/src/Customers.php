<?php
declare(strict_types=1);
namespace Fillico;

final class Customers {
    private const COOKIE = 'fillico_customer';

    public function __construct(private Store $store, private array $config) {}

    public function current(bool $required = true): ?array {
        $token = $_COOKIE[self::COOKIE] ?? '';
        $customer = null;
        if (is_string($token) && preg_match('/^[A-Za-z0-9_-]{43}$/D', $token)) {
            $customer = $this->store->one(
                'SELECT c.id,c.name,c.email,c.cart FROM customers c JOIN customer_sessions s ON s.customer_id=c.id WHERE s.token_hash=? AND s.expires>?',
                [hash('sha256', $token), millis()]
            );
        }
        if (!$customer && $required) fail(401, 'Vui lòng đăng nhập tài khoản người mua.');
        if ($required && isset($_SERVER['HTTP_X_FILLICO_BUYER']) && $_SERVER['HTTP_X_FILLICO_BUYER'] !== $customer['id']) {
            fail(401, 'Tài khoản đã thay đổi. Vui lòng tải lại trang.');
        }
        return $customer;
    }

    public function authenticate(array $input, bool $register): array {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $key = hash('sha256', ($register ? 'customer-register:' : 'customer-login:').$ip);
        $now = millis();
        $attempt = $this->store->one('SELECT * FROM login_attempts WHERE ip_hash=?', [$key]);
        $count = $attempt && $attempt['until_ms'] > $now ? (int)$attempt['attempts'] : 0;
        if ($count >= ($register ? 6 : 12)) {
            header('Retry-After: '.max(1, (int)ceil(($attempt['until_ms']-$now)/1000)));
            return ['status'=>429, 'body'=>['error'=>'Quá nhiều yêu cầu. Vui lòng thử lại sau.']];
        }
        $address = email($input['email'] ?? null);
        $password = credential($input['password'] ?? null, $register ? 12 : 1);
        $name = $register ? txt($input['name'] ?? null, 'Họ tên', 2, 100) : '';
        $customer = $this->store->one('SELECT id,name,email,password_hash FROM customers WHERE email=?', [$address]);
        $valid = !$register && verifyPassword($password, $customer['password_hash'] ?? '');
        if ($register || !$valid) {
            $until = $count ? $attempt['until_ms'] : $now + 900000;
            $this->store->query('DELETE FROM login_attempts WHERE until_ms<?', [$now]);
            $this->store->query('INSERT INTO login_attempts VALUES(?,?,?) ON DUPLICATE KEY UPDATE attempts=VALUES(attempts),until_ms=VALUES(until_ms)', [$key,$count+1,$until]);
        }
        if ($register) {
            if ($customer) return ['status'=>409, 'body'=>['error'=>'Không thể đăng ký email này. Nếu đã có tài khoản, hãy đăng nhập.']];
            $customer = ['id'=>uuid(),'name'=>$name,'email'=>$address];
            $this->store->query('INSERT INTO customers VALUES(?,?,?,?,?)', [$customer['id'],$address,$name,passwordHash($password),'[]']);
        } elseif (!$valid) {
            return ['status'=>401, 'body'=>['error'=>'Email hoặc mật khẩu không chính xác.']];
        } else {
            $this->store->query('DELETE FROM login_attempts WHERE ip_hash=?', [$key]);
        }
        $this->revokeCookie();
        $token = token();
        $this->store->query('DELETE FROM customer_sessions WHERE expires<?', [$now]);
        $this->store->query('INSERT INTO customer_sessions VALUES(?,?,?)', [hash('sha256', $token),$customer['id'],$now+7*86400000]);
        $this->cookie($token, time()+7*86400);
        return ['status'=>$register ? 201 : 200, 'body'=>['customer'=>$this->profile($customer)]];
    }

    public function profile(array $customer): array {
        return array_intersect_key($customer, array_flip(['id','name','email']));
    }

    public function logout(): void {
        $this->revokeCookie();
        $this->cookie('', time()-3600);
    }

    private function revokeCookie(): void {
        $old = $_COOKIE[self::COOKIE] ?? null;
        if (is_string($old)) $this->store->query('DELETE FROM customer_sessions WHERE token_hash=?', [hash('sha256', $old)]);
    }

    private function cookie(string $value, int $expires): void {
        setcookie(self::COOKIE, $value, [
            'expires'=>$expires, 'path'=>'/', 'secure'=>str_starts_with($this->config['origin'], 'https:'),
            'httponly'=>true, 'samesite'=>'Lax',
        ]);
    }

    public function changeCart(array $customer, array $input): array {
        $id = txt($input['variantId'] ?? null, 'Phân loại', 1, 100);
        $action = $input['action'] ?? null;
        if (!in_array($action, ['add','set','remove','buy'], true)) fail(400, 'Thao tác giỏ hàng không hợp lệ.');
        $lines = array_column(decode($customer['cart']), null, 'variantId');
        if ($action === 'remove') {
            unset($lines[$id]);
        } else {
            $quantity = integer($input['quantity'] ?? null, 'Số lượng', 1, 999);
            if ($action === 'add') $quantity += $lines[$id]['quantity'] ?? 0;
            $line = $this->store->shopLines([['variantId'=>$id,'quantity'=>$quantity]])[0];
            if (!$line['slug']) fail(409, 'Sản phẩm không còn được bán.');
            if ($line['issue'] || $quantity > 999) fail(409, 'Số lượng vượt quá tồn kho.');
            if ($action === 'buy') return ['item'=>['variantId'=>$id,'quantity'=>$quantity]];
            $lines[$id] = array_intersect_key($line, array_flip(['variantId','quantity','productName','variantName']));
        }
        if (count($lines) > 100) fail(400, 'Giỏ hàng chứa tối đa 100 phân loại.');
        $items = array_values($lines);
        $this->store->query('UPDATE customers SET cart=? WHERE id=?', [encode($items),$customer['id']]);
        return ['items'=>$items,'lines'=>$this->store->shopLines($items, true)];
    }
}
