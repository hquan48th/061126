<section class="buyer-account">
  <h1><?= $register ? 'Tạo tài khoản' : 'Đăng nhập' ?></h1>
  <p><?= $register ? 'Tạo tài khoản để lưu giỏ hàng và đặt mua sản phẩm.' : 'Đăng nhập để tiếp tục mua hàng.' ?></p>
  <form class="form-grid" id="buyer-form" method="post" data-action="<?= $register ? 'register' : 'login' ?>">
    <?php if ($register): ?><label class="span-2">Họ và tên<input name="name" autocomplete="name" minlength="2" maxlength="100" required></label><?php endif ?>
    <label class="span-2">Email<input name="email" type="email" autocomplete="username" maxlength="254" required></label>
    <label class="span-2">Mật khẩu<input name="password" type="password" autocomplete="<?= $register ? 'new-password' : 'current-password' ?>" <?= $register ? 'minlength="12"' : '' ?> maxlength="200" required><?php if ($register): ?><small>Tối thiểu 12 ký tự.</small><?php endif ?></label>
    <p class="error-message span-2" data-buyer-error role="alert" hidden></p>
    <button class="btn btn-primary span-2" type="submit" disabled><?= $register ? 'Đăng ký' : 'Đăng nhập' ?></button>
  </form>
  <p><?= $register ? 'Đã có tài khoản?' : 'Chưa có tài khoản?' ?> <a class="text-link" href="<?= $register ? '/dang-nhap' : '/dang-ky' ?>"><?= $register ? 'Đăng nhập' : 'Đăng ký' ?></a></p>
</section>
