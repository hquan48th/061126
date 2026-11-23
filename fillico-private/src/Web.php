<?php
declare(strict_types=1);
namespace Fillico;

function h(mixed $value): string { return htmlspecialchars((string)$value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'); }
function money(int|float $value): string { return number_format($value,0,',','.').'₫'; }
function icon(string $name): string {
    $paths=[
        'account'=>'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2"/>',
        'bag'=>'<path d="M6 7h12l2 14H4L6 7Z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>',
        'heart'=>'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
        'search'=>'<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
        'arrow'=>'<path d="M4 12h16m-6-6 6 6-6 6"/>',
        'leaf'=>'<path d="M20 3C6 1 1 9 5 16s16 4 15-13Z"/><path d="m4 21 12-12"/>',
        'menu'=>'<path d="M4 6h16M4 12h16M4 18h16"/>',
    ];
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'.($paths[$name]??$paths['arrow']).'</svg>';
}
function productCard(array $p): void {
    $price=min(array_column($p['variants'],'price'));$available=array_sum(array_column($p['variants'],'stock'))>0;
    $url='/san-pham/'.rawurlencode($p['slug']);
    require __DIR__.'/../templates/product-card.php';
}
function renderWebsite(string $private,array $c,string $path): void {
    if($path==='/admin'||str_starts_with($path,'/admin/')){require $private.'/templates/admin.php';return;}
    $s=new Store($c);
    $accounts = new Customers($s, $c);
    $ordersPath = '/tai-khoan/don-hang';
    $orderCode = preg_match('~^/tai-khoan/don-hang/(FL[A-Z0-9]+)$~D',$path,$matches) ? $matches[1] : null;
    $requestedPage = filter_var($_GET['page'] ?? 1, FILTER_VALIDATE_INT, ['options'=>['min_range'=>1]]) ?: 1;
    [$products,$settings,$buyer,$cartItems,$cartLines,$history,$customerOrder] = $s->transaction(function() use ($s,$accounts,$path,$ordersPath,$orderCode,$requestedPage) {
        $buyer = $accounts->current(false);
        $items = $buyer ? decode($buyer['cart']) : [];
        $lines = in_array($path, ['/gio-hang','/thanh-toan'], true) ? $s->shopLines($items, true) : [];
        $history = $buyer && $path === $ordersPath ? $s->customerOrders($buyer['id'], $requestedPage) : null;
        $order = $buyer && $orderCode !== null ? $s->customerOrder($buyer['id'], $orderCode) : null;
        return [$s->products(true),$s->settings(),$buyer,$items,$lines,$history,$order];
    }, false);
    $customer = $buyer ? $accounts->profile($buyer) : null;
    if (!$customer && ($path === $ordersPath || $orderCode !== null)) {
        header('Location: /dang-nhap?next=orders', true, 302);
        return;
    }
    $categories=array_values(array_unique(array_column($products,'category')));
    $page=match($path){'/'=>'home','/san-pham'=>'catalog','/gio-hang'=>'cart','/thanh-toan'=>'checkout','/tra-cuu'=>'tracking','/dang-nhap','/dang-ky'=>'account',default=>'404'};
    $register = $path === '/dang-ky';
    if ($path === $ordersPath || $customerOrder) $page = 'customer-orders';
    if ($page === 'customer-orders') {
        $orderStates = ['pending'=>'Chờ xác nhận','confirmed'=>'Đã xác nhận','packing'=>'Đang chuẩn bị','shipping'=>'Đang giao hàng','delivered'=>'Đã giao hàng','cancelled'=>'Đã hủy'];
        $paymentStates = ['unpaid'=>'Chưa thanh toán','paid'=>'Đã thanh toán','refunded'=>'Đã hoàn tiền'];
        $paymentMethods = ['cod'=>'Thanh toán khi nhận hàng','bank'=>'Chuyển khoản'];
        $orderDate = static fn(string $date): string => (new \DateTimeImmutable($date))->setTimezone(new \DateTimeZone('Asia/Ho_Chi_Minh'))->format('H:i d/m/Y');
    }
    $product=null;$policy=null;
    if(preg_match('~^/san-pham/([a-z0-9-]+)$~D',$path,$m))foreach($products as $p)if($p['slug']===$m[1]){$product=$p;$page='product';break;}
    $policyNames=['giao-hang'=>'Chính sách giao hàng','doi-tra'=>'Chính sách đổi trả','bao-mat'=>'Chính sách bảo mật','thanh-toan'=>'Hướng dẫn thanh toán'];
    if(preg_match('~^/chinh-sach/([a-z0-9-]+)$~D',$path,$m)&&isset($policyNames[$m[1]])){$page='policy';$policy=$m[1];}
    if($page==='404')http_response_code(404);
    $title=$product?$product['name'].' · '.$settings['storeName']:$settings['storeName'].' — '.$settings['tagline'];
    require $private.'/templates/site.php';
}
