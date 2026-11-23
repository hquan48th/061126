# Fillico — PHP thuần / MySQL

Website bán hàng và quản trị cửa hàng chạy bằng **PHP 8.3+**, MySQL hoặc MariaDB. Giao diện là template PHP, CSS và JavaScript trình duyệt trực tiếp. Không cần Node.js, npm, React, Vite, Composer hoặc bước build. Sửa file rồi tải lại trang.

## Chạy local trên Windows

Nếu đã có runtime portable trong `work/runtime` và MariaDB đang chạy cổng 13316, có thể chuẩn bị cửa hàng local mới bằng một lệnh:

```powershell
.\work\runtime\php\php.exe tools/configure-local.php
```

Công cụ tạo/cấu hình database `fillico_local`, import schema, sao lưu config mẫu cũ và ghi mã cài đặt vào `.local/php-setup-token.txt`. Không cần dán code PHP vào PowerShell. Sau đó chạy PHP server như bên dưới và nhập mã từ file này tại `/setup.php`. Công cụ từ chối cấu hình hosting hoặc database đã có tài khoản, không dùng để cài lại cửa hàng đang có dữ liệu.

1. Cài PHP 8.3+ 64-bit và MariaDB 10.6+ / MySQL 8.0.16+; có thể dùng [WampServer](https://wampserver.aviatechno.net/). Nếu php.exe chưa có trong PATH, dùng đường dẫn đầy đủ. PHP cần `pdo_mysql`, `mbstring`, `fileinfo`, `gd`, `iconv`, Argon2id; GD hỗ trợ PNG/JPEG/WebP. Chạy `php tools/check.php` để kiểm tra.
2. Tạo database `fillico_local` với charset utf8mb4. Trong phpMyAdmin, nhập theo thứ tự `001_initial.sql`, `002_customer_accounts.sql` và `003_customer_orders.sql` trong `fillico-private/migrations/`. Cấp quyền cho user riêng trên database đó.
3. Chép `fillico-private/config.example.php` thành `config.php` trong cùng thư mục. Điền database/user/password/port thực tế. Local đặt `origin` = `http://127.0.0.1:8000`, `allow_http` = `true`. Tạo secret bằng `php -r "echo bin2hex(random_bytes(32));"` rồi điền vào `setup_token`.
4. Chạy trong PowerShell:

   ```powershell
   cd "D:\code vscode\061126"
   php -S 127.0.0.1:8000 -t public_html router.php
   ```

5. Mở <http://127.0.0.1:8000/setup.php>, nhập secret và tạo chủ cửa hàng. Khi xong, xóa `public_html/setup.php`, để `setup_token` rỗng, giữ `setup.lock`.
6. Đăng nhập <http://127.0.0.1:8000/admin>. Cài mới không tự thêm sản phẩm. Thêm qua quản trị hoặc chạy `php tools/seed-demo.php` ở terminal khác để thêm 12 sản phẩm minh họa, CHỈ khi localhost chưa có sản phẩm/đơn.

Mở đúng host/port ghi trong origin; localhost khác 127.0.0.1. Đổi cổng thì sửa cả config và lệnh chạy. Dừng server bằng Ctrl+C. Nếu dùng Wamp Apache: VirtualHost trỏ vào public_html, bật rewrite và AllowOverride All, origin khớp tên miền local.

## Cấu trúc và cách tiếp tục sửa code

```text
public_html/                    DocumentRoot; index.php, setup.php, images
  assets/shop.js                Giỏ hàng, yêu thích, thanh toán, tra cứu
  assets/admin.js               Quản trị, phiếu, nhân viên, cấu hình
  assets/common.js              HTTP và tiện ích trình duyệt
  assets/product-images.js      Tải nhiều ảnh, chọn/cắt ảnh bìa
  assets/product-images.css     Giao diện quản lý ảnh
  assets/shop.css, admin.css     CSS giữ từ giao diện cũ
  assets/php.css                Bố cục PHP và mobile
fillico-private/                Đặt ngoài public_html
  config.example.php            Chép thành config.php riêng
  defaults.php                  Cấu hình cài mới
  src/                          API/nghiệp vụ/database/render PHP
  templates/                    Các trang PHP; header/footer
  migrations/                   SQL cài mới và nâng cấp
  uploads/                      Ảnh riêng; không ghi đè khi cập nhật
router.php                      Router PHP CLI local
tools/                          Kiểm tra/đóng gói/migration PHP
tests/                          Test PHP HTTP/database/Chrome
```

Sửa template trong fillico-private/templates, API trong fillico-private/src, tương tác/CSS trong public_html/assets; tải lại trình duyệt, không biên dịch. Các form danh mục dùng GET; giỏ hàng là trang riêng; quản trị dùng JavaScript trực tiếp và dialog native.

## Ảnh sản phẩm và ảnh bìa

Trong /admin → Sản phẩm & kho → Thêm sản phẩm hoặc Chỉnh sửa:

1. Bấm **Tải nhiều ảnh**, chọn một hoặc nhiều file. Tối đa **12 ảnh gốc**, mỗi file PNG/JPEG/WebP không quá **5 MB**.
2. Bấm **Đặt làm ảnh bìa** trên ảnh muốn dùng. Ảnh đầu tiên tự làm bìa nếu sản phẩm chưa có ảnh.
3. Bấm **Căn chỉnh ảnh bìa** hoặc biểu tượng cắt ở từng ảnh. Kéo để di chuyển; dùng thanh phóng to, cuộn chuột, phím mũi tên hoặc xoay 90°. **Đặt lại** đưa khung về ban đầu; **Hủy** giữ nguyên ảnh bìa cũ.
4. Bấm **Dùng làm ảnh bìa**, rồi **Lưu sản phẩm**. Lần sửa sau có thể mở lại ảnh gốc cùng vị trí cắt đã lưu.

Gợi ý: ảnh bìa vuông **1:1, 1200 × 1200 px**, ảnh gốc đủ lớn và sản phẩm nằm gọn trong khung. Khi phóng to nhiều, dùng ảnh gốc lớn hơn 1200 px. Công cụ xuất tối đa 1200 × 1200, không phóng lớn ảnh nhỏ để tránh mờ; kích thước thật được hiển thị trong cửa sổ cắt. Ảnh gốc vẫn được giữ trong danh sách. Ảnh bìa đã cắt hiển thị đầu tiên ở trang chi tiết, các ảnh còn lại nằm trong dải ảnh thu nhỏ.

Không cần thêm bảng, nhập lại SQL hoặc cài thư viện. Nếu ảnh từ liên kết ngoài không cho phép cắt, tải file ảnh lên từ máy rồi căn chỉnh.

## Thử trên database local đã cấu hình

Sao lưu database thử trước. Với PHP portable của dự án, chạy hai lệnh sau tại thư mục gốc và giữ terminal mở.

```powershell
.\work\runtime\php\php.exe tools/migrate.php
.\work\runtime\php\php.exe -S 127.0.0.1:8000 -t public_html router.php
```

Nếu cổng 8000 đã được PHP của dự án sử dụng, chỉ chạy lệnh migration ở terminal khác rồi tải lại trang. Mở [cửa hàng](http://127.0.0.1:8000/) và [Seller Center](http://127.0.0.1:8000/admin). Giữ database, config và ảnh hiện có. Hướng dẫn hosting và kịch bản thử nằm trong [hướng dẫn cài đặt](docs/HUONG-DAN.md) và [báo cáo cập nhật](docs/BAO-CAO-CAP-NHAT.md).

## Hosting PHP

Hosting cần PHP cùng MySQL/MariaDB và Apache/LiteSpeed hỗ trợ .htaccess/rewrite. Bật `zip` và `dom` và cấp quyền ghi thư mục tạm của PHP để xuất nhập Excel. Chép **nội dung public_html** vào thư mục web, đặt fillico-private cùng cấp bên ngoài. Dùng origin HTTPS và allow_http=false. Nhập ba file SQL rồi chạy setup. Xem [docs/HUONG-DAN.md](docs/HUONG-DAN.md).

Đóng gói tùy chọn trên máy cá nhân: `php tools/package.php`. Tạo work/hosting và, nếu PHP bật zip, work/hosting.zip. Đích phải mới. Gói không chứa config, uploads thật, database, test hoặc runtime portable. Không cần đóng gói để chạy, có thể chép trực tiếp source theo bố cục trên.

## Kiểm thử

```powershell
php tools/check.php
$env:FILLICO_TEST_DSN = 'mysql:host=127.0.0.1;port=3306;charset=utf8mb4'
$env:FILLICO_TEST_USER = 'USER_TEST'
$env:FILLICO_TEST_PASSWORD = 'MAT_KHAU_TEST'
php tests/run.php
php tests/run.php --browser
```

Test cần database server localhost và user được tạo database thử. DSN test không chứa dbname. Mặc định root/cổng 3306/mật khẩu rỗng; sửa theo môi trường. Test tạo database fillico_test_<ngẫu nhiên> và bản sao ứng dụng riêng, xóa database sau khi chạy, không đọc config cửa hàng. Log/ảnh giữ trong work/test-*.

`--browser` dùng Chrome/Chromium headless qua DevTools, toàn bộ driver bằng PHP, không npm hoặc WebDriver. Có thể đặt FILLICO_CHROME thành đường dẫn Chrome/Edge/Chromium. Xem [docs/KIEM-THU.md](docs/KIEM-THU.md).

## Dữ liệu

Giữ API cho sản phẩm/phân loại/ảnh, COD/chuyển khoản thủ công, tra cứu token riêng, tồn kho, trạng thái đơn, phiếu bán hàng, banner/công ty/chính sách, nhân viên và mật khẩu. Chưa kết nối thanh toán, giao vận hoặc email/SMS bên ngoài.

Giỏ và lịch sử đơn hàng được lưu theo tài khoản trên MySQL/MariaDB. Yêu thích lưu trên trình duyệt. Thanh toán giữ yêu cầu đang chờ trong phiên của tài khoản trên tab và dùng Idempotency-Key để gửi lại khi mất phản hồi. Dữ liệu nhận hàng đang chờ sẽ hết hạn sau 30 phút. Ảnh tải lên được lưu trong fillico-private/uploads.

Sao lưu database, config.php, uploads và setup.lock trước khi cập nhật. Giữ nguyên các dữ liệu này khi tải code mới. Nếu có SQLite cũ, dùng công cụ PHP migration trong hướng dẫn; tài khoản scrypt cũ cần reset mật khẩu.
