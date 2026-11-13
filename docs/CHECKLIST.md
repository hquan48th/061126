# Checklist chuyển đổi

| Phạm vi | Bản PHP / cách đối chiếu |
|---|---|
| React, thiết kế, bố cục, nội dung | Giữ nguyên src và public ở commit GitHub nguồn |
| Tìm/lọc/danh mục/yêu thích/giỏ hàng | React cũ, API store cũ, Chromium |
| Sản phẩm/SKU/phân loại/giá/tồn/revision | Catalog.php, Store.php, API tests |
| Đặt COD/chuyển khoản/phí/free shipping | Orders.php, tính tiền backend |
| Tranh mua, rollback, retry | Giao dịch InnoDB + khóa settings trước mọi ghi |
| Tra cứu mã + token riêng | Cùng API, SHA256, 404 khi sai/thiếu token |
| Trạng thái/hủy/hoàn tồn/thanh toán | Orders.php giữ các transition cũ |
| Dashboard | Api.php, chỉ owner |
| Banner/công ty/chính sách/ngân hàng | Catalog.php, cùng JSON |
| Phiếu theo đơn/in trình duyệt | Cùng API + ReceiptEditor gốc |
| Nhân viên/phân quyền/thu hồi | Auth.php + Api.php, kiểm tra backend |
| Đăng nhập/xuất/đổi mật khẩu | Argon2id, cookie, thu hồi phiên, rate limit bền |
| Upload cũ/mới | Cùng raw bytes API, ảnh riêng ngoài webroot |
| Audit | Giữ các hành động cũ trong database |
| 9 bảng cũ | 001_initial.sql; thêm schema_migrations, login_attempts |
| SQLite → MySQL | sqlite-to-mysql.mjs, snapshot, data.sql, verify.sql, manifest |
| Tài khoản scrypt | Tắt xác thực hash cũ, reset offline có SQL riêng |
| Cài đặt mới | setup.php + config token, không seed sản phẩm |
| Shared hosting | public_html + fillico-private; .htaccess |
| Cập nhật/khôi phục | Hướng dẫn, kiểm thử trên database riêng |
| CRM/Excel | Chỉ ghi hướng mở rộng, chưa triển khai |

Trạng thái kiểm thử chi tiết nằm trong KIEM-THU.md. Checklist không thay cho việc kiểm tra cấu hình P.A Việt Nam và diễn tập với bản sao dữ liệu thật.
