# Hướng dẫn cài đặt FILLICO PHP/MySQL

Gói này dành cho Linux + PHP + MySQL/MariaDB. Máy hosting chỉ nhận tệp qua File Manager/FTP và SQL qua phpMyAdmin. Không cần chạy Node, npm, Composer, Docker, root, SSH hoặc tiến trình nền trên hosting. Các lệnh phát triển bên dưới chỉ chạy trên máy build.

## 1. Xác nhận với P.A Việt Nam trước khi mua Business 2

Chưa có xác nhận trực tiếp từ nhà cung cấp về thông số gói. Không mặc định dung lượng 8 GB. Gửi danh sách sau cho bộ phận hỗ trợ:

| Cần hỏi | Yêu cầu / lý do |
|---|---|
| Hệ điều hành và PHP | Linux, PHP 8.3+ 64 bit, chọn phiên bản trong panel |
| Extension | PDO + pdo_mysql, mbstring, JSON, fileinfo, Argon2id trong password_algos; getimagesizefromstring |
| Database | MariaDB 10.6+ hoặc MySQL 8.0.16+, InnoDB, utf8mb4, prepared statements, transaction/row lock |
| Web server | Apache 2.4 hoặc LiteSpeed hỗ trợ RewriteRule, END, Options -Indexes -MultiViews, Require all denied và .htaccess |
| Document root và private | Cho tạo fillico-private cạnh public_html; PHP open_basedir được đọc/ghi thư mục này; PHP chạy dưới user tài khoản |
| SSL | Có SSL cho tên miền chính, buộc HTTPS/canonical host; PHP nhận HTTPS=on hoặc REQUEST_SCHEME=https |
| Request/upload | Cho raw POST image tối đa 5 MiB, JSON 1 MiB; LimitRequestBody/ModSecurity không chặn PUT/PATCH/DELETE, cookie và Idempotency-Key |
| PHP limits | Khuyến nghị memory_limit >=128 MiB, post_max_size/upload_max_filesize >=8 MiB, max_execution_time >=30 giây; xác minh mức cho phép thật |
| Tài nguyên chia sẻ | RAM/CPU/IO/process/entry-process/database connection limits và cách xử lý vượt hạn mức |
| Dung lượng | Dung lượng thực, inode, database quota, băng thông; ảnh và các bản sao lưu đều chiếm chỗ |
| phpMyAdmin | Giới hạn tệp nhập, timeout, max_allowed_packet; có thể tải SQL nén và export đầy đủ không |
| Backup | Tần suất, số bản giữ, phạm vi database + tệp, phí khôi phục nếu có, tự tải bản backup về máy được không |
| Cron | Xác nhận có/không, tần suất tối thiểu; bản này không cần cron |
| Log | PHP error log riêng ngoài webroot, tắt display_errors, OPcache có cơ chế làm mới khi cập nhật |

Nếu PHP chạy dưới user khác hoặc open_basedir không cho đọc thư mục ngoài webroot, nhờ hỗ trợ cấu hình trước. Không giải quyết bằng chmod 777 hoặc mở công khai config.

## 2. Giải nén và nhận diện thư mục

Giải nén `fillico-hosting.zip` ở máy tính. Không upload nguyên ZIP vào public_html rồi để đó. Cấu trúc:

```text
public_html/                React đã build, index.php, setup.php, .htaccess, assets, images
fillico-private/            PHP src, migrations, defaults.json, config.example.php, uploads/
guides/                     tài liệu và công cụ reset mật khẩu OFFLINE
BUILD.json                  thông tin bản dựng
```

Chỉ nội dung public_html được đưa ra web. guides và BUILD.json giữ ở máy cá nhân. `fillico-private` nằm cùng cấp public_html, không phải bên trong. Không upload source ZIP, .git, .local, node_modules, test, SQL dump, bản backup hay tệp thông tin đăng nhập vào public_html.

Trong File Manager bật **Show hidden files** để nhìn và upload `.htaccess`. Có thể giải nén toàn bộ ZIP ở thư mục riêng ngoài public_html rồi chuyển đúng hai thư mục cần chạy đến vị trí trên.

## 3. Tạo database và cấu hình

1. Trong panel hosting mở mục MySQL Databases, tạo database mới và user riêng. Panel có thể tự thêm tiền tố tài khoản vào tên; ghi đúng tên đầy đủ. Cấp quyền cho user trên database này. Không dùng database đang có dữ liệu khác.
2. Mở phpMyAdmin, chọn đúng database mới. Tab Import → chọn `fillico-private/migrations/001_initial.sql` từ máy tính → charset UTF-8 → Import. Kiểm tra có 11 bảng và schema_migrations có version=1. Chưa có sản phẩm, đơn hay tài khoản là bình thường.
3. Trong thư mục fillico-private trên hosting, sao chép `config.example.php` thành `config.php`. Sửa dsn với host/port/tên database do P.A cấp, db_user và db_password. Không tự đoán database host. Giữ charset=utf8mb4.
4. Đặt origin là URL HTTPS chính xác, không dấu `/` cuối, ví dụ `https://fillico.vn`. Nếu dùng staging, điền origin staging. Không để origin staging khi mở bán. Dùng panel để thống nhất host chính (www hoặc không www) và HTTPS. `allow_http` luôn false trên hosting.
5. Giữ uploads_dir là `__DIR__ . '/uploads'`. Kiểm tra thư mục tồn tại và PHP có quyền ghi. Thư mục riêng khuyến nghị 750, uploads 700, config.php 600; tệp public 644, thư mục public 755. Nếu panel dùng cơ chế quyền khác, nhờ hỗ trợ xác nhận thay vì mở quyền ghi cho mọi người.
6. Trong PHP Settings đặt post_max_size và upload_max_filesize ít nhất 8M, memory_limit ít nhất 128M nếu gói cho phép; ứng dụng vẫn giới hạn raw ảnh 5 MiB. Không đưa phpinfo lên web. Kiểm tra giới hạn web server/ModSecurity riêng vì PHP không thể đổi giới hạn phía trước nó.

Không gửi cấu hình, mật khẩu hoặc mã cài đặt vào chat. Tệp config chỉ tồn tại ở hosting riêng và bản sao lưu có kiểm soát.

## 4A. Khởi tạo cửa hàng mới (không có dữ liệu cũ)

1. Ở máy build có Node, tạo mã ngẫu nhiên bằng `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Hoặc dùng trình quản lý mật khẩu tạo chuỗi ngẫu nhiên ít nhất 43 ký tự. Không dùng ví dụ trong mã test.
2. Điền chuỗi đó vào setup_token của config.php bằng File Manager. Không đưa mã vào URL.
3. Mở `https://TÊN-MIỀN-CỦA-BẠN/setup.php`. Trang chỉ hiển thị đạt/chưa đạt các yêu cầu PHP, không in bí mật hay toàn bộ phpinfo. Nếu thiếu extension hoặc Argon2id, nhờ hosting bật trước.
4. Nhập mã cài đặt, tên chủ shop, email và mật khẩu mới ít nhất 12 ký tự. Dùng mật khẩu riêng, lưu trong trình quản lý mật khẩu. Bấm tạo chủ cửa hàng. Nếu database đã có tài khoản, installer sẽ từ chối, không ghi đè.
5. Khi thành công, setup.lock được tạo trong thư mục riêng; installer tự trả 404 từ lần truy cập tiếp theo. Xóa setup.php khỏi public_html và xóa giá trị setup_token trong config.php. Giữ setup.lock.
6. Mở `/admin`, đăng nhập bằng tài khoản vừa tạo. Thêm sản phẩm thật, ảnh, giá, tồn kho; cập nhật thông tin công ty, chính sách, phí vận chuyển, ngân hàng. Khởi tạo chỉ thêm cấu hình mặc định, không tự thêm sản phẩm mẫu.

## 4B. Chuyển cửa hàng Node/SQLite đang có dữ liệu

Thực hiện trên bản sao trước. Clone GitHub không mang theo `.local`. Phiên chuyển đổi này không sử dụng dữ liệu thật hoặc tự nhập `.local` sẵn có của bạn.

1. Chọn giờ bảo trì, dừng nhận đơn và sửa dữ liệu trên Node. Dừng server Node rồi sao lưu toàn bộ DATA_DIR, gồm store.sqlite và uploads. Nếu không dừng được phải dùng SQLite backup API để chụp snapshot; không chỉ copy tệp SQLite đang có WAL. Giữ ít nhất một bản backup bất biến ngoài thư mục chuyển đổi.
2. Trên máy phát triển cài Node >=24. Trong thư mục source đã bàn giao, chạy:

   ```bash
   node tools/sqlite-to-mysql.mjs --source /duong-dan/ban-sao/store.sqlite --check
   node tools/sqlite-to-mysql.mjs --source /duong-dan/ban-sao/store.sqlite --export --out /duong-dan/thu-muc-moi-rieng-tu
   ```

   `--check` chỉ đọc. `--export` bắt buộc thư mục mới, tự tạo `source-backup.sqlite` nhất quán trước khi xuất. Không đổi database nguồn. Công cụ dừng nếu schema lạ, JSON/quan hệ/numeric field không hợp lệ hoặc ảnh tham chiếu bị thiếu. Không bỏ qua lỗi để nhập tiếp.
3. Thư mục xuất chứa data.sql, verify.sql, manifest.json, report.json, source-backup.sqlite và uploads. Tất cả đều là dữ liệu riêng, không đặt trong webroot. report ghi số lượng nguồn/đích. ID, mã đơn, token hash, response idempotency gồm token gốc, giá/tồn/thời gian và phiếu giữ nguyên. seq giữ thứ tự rowid. Sessions cố ý không nhập (thu hồi tất cả phiên cũ); hash scrypt giữ để đối chiếu nhưng không được đăng nhập.
4. Tạo database ĐÍCH MỚI, nhập 001_initial.sql như bước 3. Không chạy installer. Nhập data.sql qua phpMyAdmin vào database trống. Mỗi INSERT có điều kiện chỉ chạy nếu tất cả bảng đích trống ngay khi bắt đầu; database không trống báo STOP và không nhập thêm. Nếu import lỗi hoặc bị timeout, không nối tiếp mù quáng: bỏ database thử bị nhập dở, tạo database thử mới rồi nhập lại từ đầu. Không xóa dữ liệu thật để làm trống.
5. Chép ảnh từ thư mục xuất uploads vào fillico-private/uploads, giữ nguyên tên. Không chép tệp admin-credentials.txt, SQLite hay backup vào hosting public. Ảnh `/images/...` đã có trong bản build từ GitHub; nếu bạn có ảnh images riêng chưa commit, chép đúng ảnh đó sau khi đối chiếu.
6. Nhập verify.sql qua phpMyAdmin trước khi đổi mật khẩu hoặc phát sinh đơn. Cả count_ok và content_ok của đủ 9 bảng phải bằng 1. SQL đối chiếu hash nội dung tất cả cột từng dòng; sessions có số đích bằng 0. Nếu có PHP CLI và kết nối database được phép ở máy phát triển, dùng thêm `php tools/verify-import.php /duong-dan/config.php /duong-dan/manifest.json` để kiểm tra từng dòng và checksum ảnh. Không cần CLI trên hosting. Ảnh được kiểm tra thêm bằng số lượng/tên và mở URL cũ trên staging nếu không dùng CLI.
7. Đặt lại mật khẩu các tài khoản scrypt theo mục 5. Không thể dùng mật khẩu cũ ngay trên PHP. Sau reset, phép đối chiếu users/audit sẽ khác vì thay đổi này là chủ đích; lưu kết quả verify trước đó.
8. Xóa setup.php, giữ setup_token rỗng. Đăng nhập staging, kiểm tra token tra cứu cũ, phiếu, ảnh, đơn, tồn kho, cấu hình và quyền nhân viên. Giữ bản Node cùng snapshot để quay lại. Chỉ quyết định chuyển production sau khi bạn duyệt và có cửa sổ bảo trì; công việc bàn giao này chưa sửa DNS hay triển khai production.
9. Khi đã có đơn mới trên PHP, không quay về snapshot Node cũ một cách trực tiếp vì sẽ mất đơn/tồn thay đổi. Dừng ghi, sao lưu cả hai và lập kế hoạch đối soát/di chuyển các thay đổi trước khi quay lại.

## 5. Đặt lại mật khẩu tài khoản cũ

Trong phpMyAdmin đọc users để lấy đúng id và email cần reset. Trên máy cá nhân có PHP 8.3+ hỗ trợ Argon2id chạy:

```bash
php tools/reset-password.php MA_ID_NGUOI_DUNG /thu-muc-rieng/reset-owner.sql
```

Công cụ hỏi mật khẩu trên terminal và ẩn ký tự; không đưa mật khẩu vào tham số lệnh. Nó chỉ tạo SQL có hash Argon2id, không kết nối database, không lưu mật khẩu rõ. Trên Windows dùng PHP CLI phù hợp hoặc terminal Linux/WSL; nếu không thể ẩn đầu vào, công cụ từ chối tương tác thay vì hiện mật khẩu. Không upload công cụ lên URL công khai.

Nhập SQL tạo ra vào đúng database qua phpMyAdmin, xác nhận id/email trả về đúng tài khoản, rồi đăng nhập thử. SQL xóa các phiên của tài khoản và ghi audit. Tạo file reset riêng cho từng người; thông báo mật khẩu tạm qua kênh riêng của bạn, yêu cầu nhân viên đổi mật khẩu trong quản trị. Xóa tệp reset sau khi dùng và giữ kiểm soát truy cập bản sao lưu. Công cụ có thể dùng cho khôi phục tài khoản về sau; đây là thao tác quản trị dữ liệu, luôn sao lưu trước.

## 6. Nếu không đặt được thư mục riêng ngoài public_html

Ưu tiên nhờ P.A cho phép thư mục cùng cấp như cấu trúc chuẩn; việc không đổi được document root thường vẫn cho tạo thư mục ngoài public_html. Nếu thực sự không được:

1. Đặt fillico-private trong public_html. Giữ nguyên `fillico-private/.htaccess` chứa `Require all denied` và luật chặn ở `.htaccess` gốc.
2. Trong cả index.php và setup.php, đổi đúng dòng `$private=dirname(__DIR__).'/fillico-private';` thành `$private=__DIR__.'/fillico-private';`. uploads_dir trong config vẫn dùng __DIR__, nên nằm trong thư mục bị chặn.
3. Trên staging, mở `/fillico-private/config.php`, `/fillico-private/src/Support.php`, `/fillico-private/migrations/001_initial.sql` và `/fillico-private/uploads/...`: tất cả phải trả 403 hoặc 404, tuyệt đối không trả nội dung tệp. Kiểm tra `/api/store` và ảnh `/uploads/TÊN-ẢNH-CŨ.png` vẫn hoạt động.
4. Chưa mở bán nếu cơ chế deny không có hiệu lực. Không bỏ .htaccess để chữa lỗi 500. Phương án này đã được kiểm thử trên Apache; LiteSpeed và cấu hình P.A vẫn phải kiểm tra tại hosting.

## 7. Kiểm tra trước mở bán

Mở trang chủ, sản phẩm, giỏ hàng trên điện thoại và máy tính; reload `/admin` và trang sản phẩm sâu. Đặt COD và chuyển khoản với dữ liệu thử đã được bạn cho phép. Đối chiếu tiền/phí/tồn, gửi lại yêu cầu, hủy đơn và kiểm tra hoàn tồn. Đăng nhập nhân viên để xác nhận không xem dashboard/sản phẩm/cấu hình; thử đổi mật khẩu và thu hồi phiên. Kiểm tra phiếu in có dấu tiếng Việt. Tra cứu mã đơn không token phải thất bại và không lộ dữ liệu. Upload thử ảnh hợp lệ, file giả và file >5 MiB. Kiểm tra cookie Secure/HttpOnly/SameSite=Lax bằng browser DevTools trên HTTPS. Xóa dữ liệu thử theo kế hoạch riêng, không xóa nhầm đơn thật.

## 8. Cập nhật phiên bản mà không mất dữ liệu

1. Bật bảo trì/tạm dừng ghi, sao lưu database + uploads + config và giữ bản code hiện tại ở máy riêng.
2. Dùng máy build tạo gói phiên bản mới vào một thư mục mới. Chạy kiểm thử trên database staging/bản sao trước. Không chạy seed hoặc installer mỗi lần cập nhật.
3. Upload assets/images và PHP src mới, rồi chuyển index.html/index.php/.htaccess cuối cùng trong cửa sổ bảo trì. Giữ assets phiên bản trước ít nhất qua thời gian cache để tab cũ không lỗi. Có thể dùng File Manager đổi tên thư mục release nếu panel hỗ trợ, nhưng không di chuyển nhầm private config/uploads.
4. Không ghi đè config.php, uploads/, setup.lock hoặc database. Không tải lại setup.php. Gói không chứa config.php hay dữ liệu thật. Với images do bạn tự thay, đối chiếu trước khi ghi đè đường dẫn trùng.
5. Nếu phiên bản có migration mới, đọc hướng dẫn riêng, backup và chạy file mới một lần; không xóa bảng. Bản đầu chỉ có 001, nhập lại đã được kiểm thử không xóa dữ liệu.
6. Kiểm tra cấu hình OPcache và làm mới theo panel/hỗ trợ hosting; kiểm tra số bản dựng/luồng chức năng rồi mới mở ghi. Không đổi config/database chỉ để sửa cache code.

## 9. Sao lưu và khôi phục qua panel

Sao lưu: tạm dừng ghi; phpMyAdmin → Export → Custom → chọn tất cả bảng, SQL, cấu trúc + dữ liệu, giữ primary/foreign keys/auto_increment, UTF-8. Với InnoDB chọn transaction nếu panel hỗ trợ. Tải database về máy riêng. File Manager/FTP tải fillico-private/uploads, config.php, setup.lock và ghi lại phiên bản code. Không lưu file backup ZIP/SQL trong public_html. Mã hóa và giới hạn người truy cập vì có thông tin khách/phiên/token. Thử khôi phục định kỳ, không chỉ kiểm tra file tồn tại.

Khôi phục diễn tập: tạo database mới, import SQL backup, khôi phục đúng uploads và phiên bản code vào staging riêng, sửa config staging với database mới/origin staging. Kiểm tra số bản ghi, đơn mới nhất, tổng tiền, tồn, phiếu, URL ảnh và quyền. Snapshot này có thể chứa phiên đã đăng nhập: trên bản clone hoặc khi nghi lộ thông tin, xóa bảng sessions bằng DELETE trong phpMyAdmin để buộc đăng nhập lại. Khi khôi phục production, dừng ghi và duyệt phạm vi dữ liệu sẽ quay lui; không import chồng backup lên database đang bán. Giữ bản trước khôi phục để đối soát đơn phát sinh.

Ứng dụng không tự gửi email/SMS, không kết nối cổng thanh toán hoặc giao vận; đó cũng là phạm vi bản Node gốc. Chuyển khoản vẫn phải đối soát thủ công.

## 10. Dành cho người phát triển

```bash
npm ci
npm test                 # Bản tham chiếu Node/SQLite
npm run build
npm run test:e2e         # Browser trên Node
npm run test:php:setup   # Docker ở máy phát triển, tạo môi trường riêng
npm run test:php         # API + InnoDB + migration + Chromium trên PHP
npm run build:hosting    # Tạo work/hosting, phải chưa tồn tại
```

Máy kiểm thử cần Docker, Node >=24, Chromium (đường dẫn PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH nếu khác /usr/bin/chromium). Dockerfile và script setup chỉ dành cho phát triển. Script dùng tên fillico-db/fillico-web, database fillico_test/fillico_migration và mật khẩu cố định cho dữ liệu giả; tuyệt đối không dùng cấu hình test trên hosting. Nếu môi trường test cũ tồn tại, kiểm tra đúng container thử rồi dừng/xóa chúng và dùng thư mục sandbox mới; script không tự xóa container có sẵn. Không chạy hai bộ test PHP đồng thời trên cùng database thử.

Build hosting chỉ sao chép frontend build và PHP runtime không có dependency Composer. Code Node trong server/ được giữ nguyên để tham chiếu/quay lại; test có adapter để chạy cùng assertion trên PHP. Xem KHAO-SAT.md, CHECKLIST.md, KIEM-THU.md và KIEN-TRUC.md trước khi duyệt chuyển đổi.
