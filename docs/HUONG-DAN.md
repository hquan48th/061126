# Cài đặt và cập nhật Fillico PHP

## Yêu cầu

PHP 8.3+ 64-bit với Argon2id, `pdo_mysql`, `mbstring`, JSON, `fileinfo`, `iconv` và GD hỗ trợ PNG/JPEG/WebP. Excel cần `zip` và `dom`, cùng quyền ghi thư mục tạm của PHP. MySQL 8.0.16+ hoặc MariaDB 10.6+ dùng InnoDB/utf8mb4. Apache 2.4 hoặc LiteSpeed cần hỗ trợ .htaccess/rewrite, cờ [END] và AllowOverride All. PHP cần đọc/ghi được thư mục private ngoài DocumentRoot.

Hosting dùng HTTPS. Gợi ý memory_limit >=128M, post_max_size/upload_max_filesize >=8M; ứng dụng giới hạn raw ảnh 5 MiB, JSON 1 MiB. Xác nhận web server không chặn PUT/PATCH/DELETE, cookie hoặc Idempotency-Key. Không cần Node/npm/Composer/build.

## Cài mới

1. Chép nội dung public_html vào thư mục web, giữ file ẩn .htaccess. Đặt fillico-private cùng cấp bên ngoài. Không công khai source/config/SQL/backup.
2. Tạo database và user riêng. Trong phpMyAdmin, nhập theo thứ tự `001_initial.sql`, `002_customer_accounts.sql` và `003_customer_orders.sql` trong `fillico-private/migrations/`. Giá trị cao nhất trong `schema_migrations` phải là 3.
3. Chép config.example.php thành config.php trong private. Điền host/port/database/user/password thật, origin `https://ten-mien` không dấu / cuối, uploads_dir mặc định, allow_http=false. Thống nhất HTTPS/host chính trong panel.
4. PHP có quyền ghi private và uploads. Quyền tham khảo: thư mục public 755, file public 644, private 750, uploads 700, config 600; theo user chạy PHP của hosting.
5. Tạo secret ngẫu nhiên 32 byte bằng trình quản lý mật khẩu hoặc `php -r "echo bin2hex(random_bytes(32));"` trên máy cá nhân; điền setup_token. Không đặt secret trong URL.
6. Mở /setup.php, kiểm tra môi trường, nhập secret/email/tên/mật khẩu (12–200 đơn vị UTF-16, không khoảng trắng đầu/cuối). Installer tạo owner/cấu hình mặc định, không thêm sản phẩm mẫu và không ghi đè tài khoản cũ.
7. Xóa setup.php và setup_token sau khi xong; giữ setup.lock. Mở /admin, thêm sản phẩm, cấu hình công ty, phí, banner, ngân hàng, chính sách.

Controller hỗ trợ private trong public_html nếu hosting bắt buộc: giữ .htaccess chặn ở cả hai nơi; kiểm chứng URL config/src/SQL/private ảnh trả 403/404. Chỉ giữ MỘT config.php ở bố cục được chọn.

Nếu lỗi API, xem PHP error log/config/database. Trang sâu 404: kiểm tra rewrite và .htaccess. Không bỏ luật chặn private để sửa lỗi.

## Local và phát triển

Làm theo README. Chạy `php -S 127.0.0.1:8000 -t public_html router.php`. Local origin phải là http://127.0.0.1:8000 và allow_http=true; database phải chạy. PHP CLI server chỉ dành local.

Template: fillico-private/templates. Nghiệp vụ: fillico-private/src; Api.php (route), Auth.php (tài khoản), Catalog.php (sản phẩm/settings), Orders.php (đơn), Store.php (database), Web.php (render). Tương tác/CSS: public_html/assets. Sửa file trực tiếp, không build. Kiểm tra bằng tools/check.php và tests/run.php; browser tùy chọn --browser.

## Chuyển SQLite cũ bằng PHP

Máy chuyển cần pdo_sqlite và sqlite3; website/hosting bình thường không cần. Công cụ chỉ đọc bản sao SQLite và xuất SQL.

1. Dừng ghi ở hệ thống cũ, sao lưu database và uploads nhất quán; không chỉ copy .sqlite đang có WAL. Giữ bản gốc.
2. Chạy `php tools/sqlite-to-mysql.php --source /backup/store.sqlite --check`.
3. Xuất vào thư mục MỚI: `php tools/sqlite-to-mysql.php --source /backup/store.sqlite --export --out /NEW/private-export`. Kết quả: source-backup.sqlite, data.sql, verify.sql, manifest.json, report.json, uploads/. Nếu lỗi, không nhập kết quả dở dang.
4. Tạo database đích mới và nhập hai migration như mục Cài mới. Import data.sql vào database trống. Giữ ID, đơn, phiếu, token tra cứu, dữ liệu chống trùng, giá, tồn và thứ tự. Phiên cũ sẽ hết hiệu lực. Công cụ phải báo kiểm tra đạt trước khi tiếp tục.
5. Chép ảnh xuất vào private/uploads, giữ tên. Import verify.sql: mọi count_ok/content_ok bằng 1. Chạy thêm `php tools/verify-import.php /private/config.php /private-export/manifest.json` để đối chiếu từng dòng và checksum ảnh.
6. Reset tài khoản scrypt cũ SAU khi verify: `php tools/reset-password.php USER_ID /private/reset.sql`. Công cụ nhận mật khẩu từ stdin, không tham số. Terminal tương tác phải hỗ trợ ẩn nhập; Windows có thể dùng WSL hoặc pipe từ công cụ quản lý bí mật. Nhập SQL bằng phpMyAdmin rồi xóa file reset.
7. Giữ setup_token rỗng, không upload setup.php cho bản chuyển dữ liệu. Kiểm tra đơn/token cũ, ảnh, tồn, phiếu và tài khoản trên staging trước khi mở ghi.

Sau khi PHP có đơn mới, không quay về snapshot cũ mà chưa đối soát đơn/tồn phát sinh.

## Bảo trì và sao lưu

Sửa code rồi tải lên đúng đường dẫn. Dùng cửa sổ bảo trì cho nhiều file; làm mới OPcache theo panel nếu cần. Trình duyệt tải lại mạnh để nhận CSS/JS mới.

1. Sao lưu SQL đầy đủ và giữ bản sao `config.php`, `uploads` và `setup.lock` ngoài webroot. Thử khôi phục bản sao vào database mới.
2. Khi kiểm thử trên database Fillico đã cấu hình, có thể chạy `php tools/migrate.php` để đồng bộ schema. Công cụ đọc `fillico-private/config.php` và cần quyền `CREATE TABLE`.
3. Kiểm tra `SELECT MAX(version) FROM schema_migrations;` trả về 3. Trong môi trường thử, đăng ký một tài khoản, đặt thử và mở **Đơn hàng của tôi**. Từ Seller Center, xuất file Excel, sửa một dòng và nhập lại.

`php tools/package.php /NEW/output-folder` tạo gói từ source hiện tại, không cần Git/compiler. ZIP cần extension zip. Chỉ upload public_html và fillico-private; README/guides/tools/BUILD.json giữ ở máy cá nhân.

Chưa xác minh P.A Việt Nam/hosting thật trong lần này. Cần staging để kiểm tra extensions/database/rewrite/deny/quyền/HTTPS và hạn mức thực tế.
