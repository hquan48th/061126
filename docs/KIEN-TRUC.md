# Kiến trúc PHP

public_html/index.php phân luồng /api/* tới Api.php, /uploads/* tới bộ đọc ảnh, các trang còn lại tới Web.php và template PHP. Apache dùng .htaccess; local PHP CLI dùng router.php. CSS/JavaScript phục vụ trực tiếp, không thư viện/build.

Web.php đọc products/settings trong transaction và render HTML phía server. Nội dung database được escape; JSON nhúng dùng JSON_HEX_TAG/AMP/APOS/QUOT. common.js escape nội dung dựng HTML; phiếu in dùng textContent.

Database có 11 bảng InnoDB. Transaction ghi lấy khóa settings(id=1) đầu tiên để bảo vệ stock/revision/idempotency/hoàn tồn/thu hồi quyền qua nhiều worker. Transaction đọc không lấy khóa shop. PDO dùng prepared statements native, utf8mb4_bin, UTC.

Session token ngẫu nhiên chỉ lưu SHA-256, cookie HttpOnly/SameSite=Lax và Secure với HTTPS. Mật khẩu Argon2id; rate limit lưu database. Quyền owner/staff kiểm tra ở API; Origin/Sec-Fetch-Site kiểm tra request ghi.

Checkout tính giá/phí/tồn ở server, ghi atomically. Client lưu request/key trước khi gửi; lỗi mạng/5xx giữ nguyên để replay sau reload. Sau 30 phút xóa thông tin khách chờ và yêu cầu xác nhận trước khi bắt đầu mới.

Upload kiểm tra MIME/header/kích thước/checksum PNG/GD decode, giới hạn 5 MiB; đặt UUID trong private/uploads và PHP phục vụ qua /uploads/*. Không chạy script ở uploads.

defaults.php dùng lúc cài mới. Đóng gói không lấy config.php/uploads thật/setup.lock/database. Migration SQLite cũ là PHP CLI tùy chọn, không chạy trên web request.

## Quản lý ảnh sản phẩm

product-images.js/CSS là module trình duyệt riêng, không cần npm. Upload từng file qua API ảnh hiện có; tối đa 12 ảnh gốc. Canvas xử lý kéo/phóng/xoay và xuất bản bìa WebP (PNG nếu trình duyệt không hỗ trợ). PHP vẫn kiểm tra MIME, byte ảnh, kích thước và GD decode như upload thông thường.

Trong JSON sản phẩm: image là URL ảnh bìa, images là danh sách ảnh gốc, coverSource là ảnh gốc của bìa, coverCrop lưu zoom/offsetX/offsetY/rotation. Catalog kiểm tra các thông số và giữ metadata khi client cũ cập nhật mà không gửi lại chúng. Không đổi schema MySQL. Trang chi tiết đưa bìa lên đầu và không lặp lại ảnh gốc đã được dùng để cắt bìa; các ảnh gốc vẫn có trong trình quản trị.
