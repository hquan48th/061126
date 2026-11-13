# Thiết kế và mở rộng

Runtime không dùng Composer hay thư viện bên thứ ba. PHP >=8.3, 64 bit, PDO MySQL, mbstring, JSON, fileinfo, Argon2id. MySQL >=8.0.16 hoặc MariaDB >=10.6, InnoDB, utf8mb4; đã kiểm thử MariaDB 10.11. Dữ liệu JSON lưu LONGTEXT + CHECK JSON_VALID để giữ nguyên ảnh chụp sản phẩm/đơn hàng và tương thích hai hệ database. seq thay cho SQLite rowid; ID, mã, thời gian gốc giữ nguyên. Không phụ thuộc cron, tiến trình nền, Node, npm, root, SSH trên hosting.

Các phần: Support (kiểu JSON/validation/tiền nguyên/thời gian UTC), Store (PDO/prepared statements/giao dịch), Auth (phiên/Argon2id/giới hạn đăng nhập), Catalog, Orders, Api (định tuyến). Front controller chỉ nhận request và gọi nghiệp vụ; Apache xử lý React và tài nguyên build. Ảnh tải lên nằm ngoài webroot, chỉ đọc qua /uploads/tên-ngẫu-nhiên. PHP không include/execute nội dung ảnh.

Mọi thao tác ghi nghiệp vụ khóa `settings.id=1 FOR UPDATE` trước khi kiểm tra quyền và đọc trạng thái. Cách này cố ý tuần tự hóa các giao dịch ngắn của một cửa hàng, giữ tính đúng của JSON tồn kho/revision và idempotency giữa các PHP worker. Giao dịch lỗi rollback. Các GET dùng snapshot riêng để đọc sản phẩm và phân loại nhất quán. Không dùng bộ nhớ tiến trình cho khóa hay rate limit. Login attempts lưu hash IP, thời hạn 15 phút; không tin X-Forwarded-For từ khách. Phiên 7 ngày, HttpOnly, SameSite=Lax, Secure theo origin HTTPS cấu hình. Mọi mutation kiểm tra Origin chính xác, Sec-Fetch-Site và kiểu nội dung; không bật CORS.

Khóa chung phù hợp quy mô ban đầu nhưng giới hạn tốc độ ghi đồng thời. Chưa đo thông lượng/CPU/RAM trên Business 2. Khi cần mở rộng, chuẩn hóa stock/price/revision thành cột và khóa sản phẩm theo thứ tự nhất quán, thêm bảng idempotency có khóa riêng; phải giữ các bài test tranh mua và rollback trước khi thay cơ chế khóa.

Database không tự seed khi deploy. 001_initial.sql tạo cấu trúc và ghi schema_migrations phiên bản 1; nhập lại không xóa dữ liệu. Bản nâng cấp sau thêm file 002_..., chạy trên bản sao trước, sao lưu rồi chạy một lần qua phpMyAdmin và ghi số phiên bản. Không sửa file 001 để giả định database cũ đã được nâng cấp; không dùng DROP hoặc seed lại.

Mật khẩu Node scrypt không được xác thực bằng password_verify. Hash cũ giữ trong lần nhập để đối chiếu nguyên dữ liệu, nhưng Auth chỉ chấp nhận Argon2id. Phiên cũ không nhập. Chủ shop reset từng tài khoản bằng công cụ offline rồi nhập SQL riêng. Không có mật khẩu mặc định, endpoint reset công khai hay mật khẩu dạng rõ được lưu.

Hướng 5.000 khách hàng: thêm customers(id, normalized_phone, normalized_email, name, address, created_at, updated_at), liên kết orders.customer_id nullable trong migration mới; giữ snapshot customer trong JSON đơn để lịch sử không đổi theo hồ sơ. Lập index normalized_phone/email, customer_id + created_at cho đơn; tránh tải toàn bộ dữ liệu khi tìm kiếm, thêm phân trang. Chuẩn hóa số điện thoại Việt Nam về dạng +84, email chữ thường; không coi tên/địa chỉ giống nhau là cùng người. Dùng danh sách trùng cần người duyệt, không gộp tự động đơn/khách.

Nhập CSV/Excel sau này: bước tải lên → kiểm tra cột/preview → kiểm tra trùng → nhập theo batch 100–500 dòng có resume/idempotency, lưu báo cáo lỗi riêng, giới hạn dung lượng/dòng, chống công thức độc hại khi xuất CSV. Chỉ thêm thư viện Excel khóa phiên bản ở máy build khi tính năng được giao; hiện chưa triển khai CRM, Excel hay hạ tầng hàng đợi.
