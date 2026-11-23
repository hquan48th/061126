# Kiểm thử PHP template

`php tools/check.php`: yêu cầu môi trường và lint file PHP.

`php tests/run.php`: database thật localhost, tự tạo database fillico_test_<ngẫu nhiên> và bản sao app riêng; không đọc config cửa hàng. DSN quản trị không chứa dbname, đặt FILLICO_TEST_DSN/USER/PASSWORD. Database thử được xóa sau khi chạy; log giữ ở work/test-*.

`php tests/run.php --browser`: thêm Chrome/Chromium headless qua driver DevTools thuần PHP trong tests/Browser.php. Đặt FILLICO_CHROME nếu không tìm thấy executable tự động. Không npm/WebDriver.

Assertion HTTP: installer/khóa cài, PHP HTML/deep link/404/HEAD, chặn private/traversal, owner login, sản phẩm/ID variant "0", tìm không dấu/lọc giá, checkout/replay/conflict/overselling/rollback, token riêng, revision, bảo vệ variant đang có đơn, phiếu literal text, hoàn tồn một lần, Unicode whitespace, staff/thu hồi, escape HTML, origin, mật khẩu/logout.

Assertion browser: yêu thích/mobile, giỏ sau reload, chọn variant/đổi quantity, cắt phản hồi sau khi đơn commit rồi reload và replay, pending hết hạn, admin sửa sản phẩm/lưu phiếu/settings/logout. Screenshot trong work/test-*.

PHP CLI server không xác nhận .htaccess/TLS/nhiều worker/hiệu năng hosting; cần staging Apache/LiteSpeed thực tế. Chưa kiểm chứng P.A Việt Nam, tiền thật, in vật lý hoặc dữ liệu khách thật. Không dùng số test React/Node cũ làm kết quả bản này.

## Kết quả xác minh ngày 18/11/2026

- PHP 8.3.36, MariaDB 10.11.19 trên Windows, database và ứng dụng thử riêng.
- tools/check.php: yêu cầu môi trường và cú pháp PHP đạt.
- tests/run.php --browser: **37 đạt, 0 lỗi** — 26 nhóm HTTP/API, 4 nhóm migration SQLite và 7 nhóm trình duyệt Chrome.
- Đã kiểm tra ảnh mobile catalog và dialog phiếu; browser có assertion không tràn ngang mobile, upload ảnh, sửa sản phẩm/banner, nhân viên/mật khẩu và logout.
- Checkout được cắt phản hồi sau khi server đã commit, rồi reload và gửi lại: cùng request/key, không tạo đơn thứ hai.
- Lượt chạy cuối có log/ảnh tại work/test-f2b43cc2a6 (thư mục bỏ qua bởi Git).
- Những lần thử đầu phát hiện lỗi import helper ở product-card và lỗi điều khiển confirm của driver test. Cả hai đã được sửa trước lượt 37/37 cuối.
- Chưa triển khai lên hosting thật; .htaccess/TLS và giới hạn hosting vẫn cần staging.

## Sửa khởi động local ngày 18/11/2026

Config mẫu hosting chưa được sửa có allow_http=false và setup_token rỗng; trước đây installer trả 404 trống. PHP CLI installer nay hiển thị hướng xử lý khi chưa bật hoặc đã cài. Thêm tools/configure-local.php để cấu hình database local bằng PHP, lưu secret trong .local và giữ bản sao config mẫu cũ. Không tạo owner hoặc dữ liệu mẫu tự động.

Sau sửa: 31 kiểm thử HTTP/migration đạt, 0 lỗi, gồm regression installer thiếu token; kiểm tra môi trường/cú pháp đạt. Trang setup của cửa hàng local thực tế trả HTTP 200, đủ extension. Không tạo tài khoản thay người dùng. Bộ browser 7 bài đã đạt trong lần chuyển đổi trước; lần sửa trang cài đặt này không chạy lại browser.

## Khôi phục giao diện quản trị ngày 18/11/2026

Khôi phục Seller Center theo sidebar cũ: logo, nhóm Quản lý/Cửa hàng, icon SVG cho các mục menu, thẻ tên cửa hàng, avatar, nút đổi mật khẩu/đăng xuất và liên kết xem website. Đưa lại topbar, thông báo đơn chờ, icon nút thao tác và thẻ tổng quan. Font Be Vietnam Pro được giữ từ gói phát hành trước; mọi font/icon tải từ file local, không React/npm/CDN.

Admin thêm phiên bản asset theo thời gian sửa file để tải lại nhận được CSS/JavaScript mới. Menu điện thoại có backdrop, đóng menu khi chuyển mục, Escape và giữ focus trong menu đang mở. Đã kiểm tra ảnh desktop/mobile và sửa nền footer bị ảnh hưởng bởi CSS cửa hàng.

Xác minh: tools/check.php đạt; tests/run.php --browser đạt 38/38, gồm sidebar SVG, nhãn menu cũ, drawer điện thoại, không tràn ngang và các luồng nghiệp vụ. Log/ảnh: work/test-dab5e83c2a. Không sửa dữ liệu hoặc config cửa hàng đang chạy.

## Nhiều ảnh và căn chỉnh ảnh bìa ngày 18/11/2026

Thêm module product-images.js/CSS cho cả thêm và sửa sản phẩm. Tải nhiều PNG/JPEG/WebP, tối đa 12 ảnh gốc và 5 MB mỗi file; chọn một ảnh bìa, kéo/phóng/xoay và cắt vuông. Gợi ý 1200 × 1200 px. Ảnh nhỏ không bị phóng lớn khi xuất, ảnh gốc được giữ. Có thể mở lại đúng ảnh gốc/vị trí cắt đã lưu. Hủy không thay đổi bìa; bấm lại ảnh đang là bìa không làm mất bản cắt. Lưu sản phẩm mới ghi thay đổi vào database; schema SQL không đổi.

Kiểm thử cuối: **43 đạt, 0 lỗi** (33 HTTP/API/migration và 10 nhóm browser). Assertion mới kiểm tra metadata và giới hạn ảnh, chọn nhiều file trong cùng một lần, kéo/xoay/phóng to, pixel ảnh cắt so với canvas, kích thước 800 × 800 từ vùng cắt gốc, checksum ảnh gốc không đổi, mở lại khung cắt, hủy thao tác, đổi bìa, giới hạn 12 ảnh và trang chi tiết đủ 12 thumbnail không tràn ngang mobile. Đã xem ảnh cửa sổ cắt và gallery desktop/mobile; sửa min-height dialog và dải thumbnail để không tràn trang.

Log/ảnh: work/test-4e540a6272; kiểm tra môi trường/cú pháp PHP đạt. Không sửa config hoặc dữ liệu cửa hàng đang dùng. Chưa triển khai lên hosting thật.

## Logo, tài khoản người mua và Excel ngày 21/11/2026

PHP 8.3.36, MariaDB 10.11.19 và Chrome headless đạt **51/51**. Lượt chạy ở `work/test-8c3a9d9782`. Bao gồm nâng cấp schema 1 chạy lại được, phân quyền, xóa/khôi phục và hoàn tồn, lỗi Excel và phiên bản cũ, hai giỏ trên cùng thiết bị, tiếp tục thao tác sau đăng nhập, mua ngay và lỗi từng trường thanh toán. Kiểm tra tệp bằng openpyxl xác nhận hai sheet và SKU văn bản khi lưu lại. Xem [báo cáo cập nhật](BAO-CAO-CAP-NHAT.md).

## Bản phát hành đầu tiên ngày 21/11/2026

Bộ PHP/API/SQL đạt **42/42** tại `work/test-aa644abc9c`. Bộ đầy đủ đạt **56/56** tại `work/test-f71ba8810d`. Có thêm kiểm tra nhập Excel trực tiếp và từ chối toàn bộ tệp khi một dòng lỗi, nhận biết giỏ vượt tồn, yêu cầu xác nhận lại khi phí giao hàng đổi, phân trang và quyền sở hữu đơn, và hướng dẫn chuyển khoản. Xem [báo cáo phát hành](BAO-CAO-CAP-NHAT.md).
