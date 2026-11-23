<?php use function Fillico\{h,money}; ?>
<nav class="breadcrumb" aria-label="Vị trí trang">
  <a href="/">Trang chủ</a><span>›</span>
  <?php if ($customerOrder): ?><a href="<?= h($ordersPath) ?>">Đơn hàng của tôi</a><span>›</span><?= h($customerOrder['code']) ?>
  <?php else: ?><span>Đơn hàng của tôi</span><?php endif ?>
</nav>
<?php if ($customerOrder): $order = $customerOrder; ?>
  <div class="page-title"><h1>Đơn <?= h($order['code']) ?></h1><p>Đặt lúc <?= h($orderDate($order['createdAt'])) ?></p></div>
  <?php if (($_GET['dat-hang'] ?? '') === '1'): ?><p class="buyer-order-note" role="status">Đơn hàng đã được ghi nhận.</p><?php endif ?>
  <section class="order-result buyer-order-detail">
    <div class="order-result-header">
      <div><h2>Chi tiết đơn hàng</h2><p><?= h($paymentMethods[$order['paymentMethod']]) ?> · <?= h($paymentStates[$order['paymentStatus']]) ?></p></div>
      <span class="order-status <?= h($order['status']) ?>"><?= h($orderStates[$order['status']]) ?></span>
    </div>
    <?php foreach ($order['items'] as $item): ?>
      <div class="order-item"><div><strong><?= h($item['productName']) ?></strong><small><?= h($item['variantName']) ?> · <?= money($item['price']) ?> × <?= h($item['quantity']) ?></small></div><strong><?= money($item['price']*$item['quantity']) ?></strong></div>
    <?php endforeach ?>
    <div class="buyer-order-amount"><span>Tạm tính</span><span><?= money($order['subtotal']) ?></span></div>
    <div class="buyer-order-amount"><span>Phí giao hàng</span><span><?= money($order['shippingFee']) ?></span></div>
    <div class="order-total"><strong>Tổng thanh toán</strong><strong><?= money($order['total']) ?></strong></div>
    <h3>Thông tin nhận hàng</h3>
    <p><?= h($order['customer']['name']) ?> · <?= h($order['customer']['phone']) ?></p>
    <p><?= h($order['customer']['address']) ?></p>
    <?php if ($order['customer']['email']): ?><p><?= h($order['customer']['email']) ?></p><?php endif ?>
    <?php if ($order['customer']['note']): ?><p>Ghi chú <?= h($order['customer']['note']) ?></p><?php endif ?>
  </section>
  <?php if ($order['paymentMethod']==='bank' && $order['paymentStatus']==='unpaid' && $order['status']!=='cancelled'): ?>
    <div class="bank-instructions">
      <h3>Thông tin chuyển khoản</h3>
      <?php if (trim($settings['bankInfo'])!==''): ?>
        <p><?= nl2br(h($settings['bankInfo'])) ?></p>
        <p>Nội dung chuyển khoản <strong><?= h($order['code']) ?></strong></p>
      <?php else: ?><p>Vui lòng liên hệ cửa hàng để nhận thông tin chuyển khoản cho đơn này.</p><?php endif ?>
    </div>
  <?php endif ?>
  <p><a class="btn btn-outline" href="<?= h($ordersPath) ?>">Về danh sách đơn hàng</a></p>
<?php else: ?>
  <div class="page-title"><h1>Đơn hàng của tôi</h1></div>
  <?php if (!$history['orders']): ?>
    <div class="empty-state"><h2>Bạn chưa có đơn hàng</h2><a class="btn btn-primary" href="/san-pham">Xem sản phẩm</a></div>
  <?php else: ?>
    <div class="buyer-order-list">
      <?php foreach ($history['orders'] as $order): ?>
        <article class="order-result buyer-order-card">
          <div class="order-result-header">
            <div><h2><?= h($order['code']) ?></h2><p><?= h($orderDate($order['createdAt'])) ?></p></div>
            <span class="order-status <?= h($order['status']) ?>"><?= h($orderStates[$order['status']]) ?></span>
          </div>
          <p><?= h($paymentMethods[$order['paymentMethod']]) ?> · <?= h($paymentStates[$order['paymentStatus']]) ?></p>
          <div class="buyer-order-amount"><strong><?= money($order['total']) ?></strong><a class="btn btn-outline" href="<?= h($ordersPath.'/'.$order['code']) ?>" aria-label="<?= h('Xem đơn '.$order['code']) ?>">Xem chi tiết</a></div>
        </article>
      <?php endforeach ?>
    </div>
    <?php if ($history['pages'] > 1): ?>
      <nav class="buyer-order-pages" aria-label="Phân trang đơn hàng">
        <?php if ($history['page'] > 1): ?><a class="btn btn-outline" href="?page=<?= $history['page']-1 ?>">Trang trước</a><?php endif ?>
        <span>Trang <?= $history['page'] ?> / <?= $history['pages'] ?></span>
        <?php if ($history['page'] < $history['pages']): ?><a class="btn btn-outline" href="?page=<?= $history['page']+1 ?>">Trang sau</a><?php endif ?>
      </nav>
    <?php endif ?>
  <?php endif ?>
<?php endif ?>
