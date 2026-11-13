# Kết quả kiểm thử

Ngày kiểm thử: 13/11/2026 (giờ Việt Nam). Nguồn gốc: commit 3d95cb782ed7843da043573e8dbd6b890667d860. Toàn bộ dữ liệu dùng trong test là giả, được tạo trong thư mục/database riêng; không đọc dữ liệu khách trong `.local`.

## Môi trường thực tế

- Node 24.22.1, React/TypeScript/Vite theo package-lock gốc, Chromium / Playwright 1.56.
- PHP 8.3.36, PDO MySQL native prepared statements, mbstring, fileinfo, Argon2id.
- MariaDB **10.11.19**, InnoDB, utf8mb4; chạy nhiều Apache worker độc lập, không dùng SQLite để thay cho kiểm thử database đích.
- Apache 2.4.69, mod_rewrite, mod_headers và mod_ssl. Có thử TLS thật ở localhost với chứng chỉ thử và CA được xác minh, không tắt kiểm tra TLS.
- Docker chỉ được dùng ở máy phát triển để kiểm thử. Không nằm trong gói runtime hosting.

## Kết quả

| Nhóm | Kết quả |
|---|---|
| API Node gốc | 23/23 đạt |
| Browser Node gốc | 5/5 đạt, gồm desktop/mobile |
| Build TypeScript/Vite | Đạt; không sửa src/public của giao diện so với commit gốc |
| API assertions cũ chạy trên PHP | 22/22 đạt; bài SQLite persistence riêng được skip có lý do |
| Integration PHP/InnoDB bổ sung | 10/10 đạt |
| Browser chạy trên PHP | 5/5 đạt |
| TLS và bố trí private bên trong public_html | Đạt: cookie, deny, ảnh cũ, SPA reload |
| PHP syntax và git diff whitespace | Đạt |

Tổng bộ API/PHP: 33 bài được liệt kê, **32 pass, 0 fail, 1 skip**. Skip là bài khởi tạo/restart của Store SQLite; thay thế bằng kiểm thử cập nhật PHP, reapply schema và SQL dump/restore thực sự trên MariaDB. Bài từ chối migration khi thiếu ảnh cố ý tạo lỗi và in `Migration stopped`; đó là assertion âm đã đạt, không phải lỗi di chuyển bị bỏ qua.

## Những tình huống đã chạy

Các assertion API gốc: tính giá server, kiểm tra quantity/stock, gộp phân loại trùng; COD/chuyển khoản chưa/có cấu hình; idempotency lặp/xung đột; tra cứu thiếu/sai/đúng token; hủy/hoàn tồn một lần; các chuyển trạng thái và ràng buộc hoàn tiền; auth/logout/CSRF; staff không vượt quyền; thay mật khẩu/thu hồi xóa phiên; stale revision; tạo/sửa/ẩn sản phẩm, chặn xóa biến thể còn đơn; banner/công ty/phí; upload hợp lệ/giả/sai quyền và tải lại bytes; phiếu riêng theo đơn; lỗi giỏ nhiều dòng và tổng thay đổi phải rollback; chặn đường dữ liệu riêng.

10 integration tests:

1. Tồn = 1, tám request song song: đúng một 201, bảy 409, tồn cuối 0.
2. Tám retry cùng key: cùng ID và token, tồn trừ một lần; tám lần hủy đồng thời: hoàn tồn một lần.
3. Chèn lỗi database sau bước cập nhật tồn bằng trigger thử: 500, stock/order/idempotency rollback đầy đủ.
4. 12 lần đăng nhập sai, restart Apache graceful, lần tiếp theo vẫn 429 và có Retry-After.
5. JSON lỗi, content-type sai, cross-site, origin giả, ảnh >5 MiB, MIME sai, kích thước pixel vượt giới hạn đều bị từ chối.
6. Reload trang con; chặn dotfiles/config/source/backup/script/path traversal.
7. Copy lại code PHP + nhập lại schema không mất đơn, tồn, phiếu, phiên; dump MariaDB và restore giữ nguyên dữ liệu đối chiếu.
8. Tạo SQLite giả có 12 sản phẩm, 24 phân loại, 1 settings, 1 đơn, 1 phiếu, 1 idempotency, 1 user scrypt, 1 session, 2 audit, 1 ảnh. Check/export không đổi byte database nguồn. Snapshot/export/import thực sự vào MariaDB; đủ 9 bảng qua so sánh số lượng và hash từng dòng; checksum ảnh khớp. Nhập lặp vào database không trống báo STOP và không thay dữ liệu. Retry Node cũ vẫn trả đúng đơn/token, token tra cứu cũ hoạt động, hash scrypt bị vô hiệu; tạo SQL reset offline và kiểm chứng Argon2id mới. Bỏ ảnh tham chiếu thì converter từ chối.
9. Installer kiểm tra PHP/database/schema/InnoDB, yêu cầu secret và origin; hai request cài đồng thời chỉ tạo một owner; không thêm sản phẩm mẫu; installer 404 sau thành công.
10. Giữ `{}` khác `[]` cho policies, hỗ trợ key dạng số và số JSON `1.0` như JavaScript; tiền phản hồi vẫn là JSON number.

Browser PHP dùng nguyên 5 kịch bản React gốc: tìm kiếm không dấu/danh mục/lọc tồn/sort/favorites; cart sau reload, chọn variant, checkout, tra cứu, quản trị hủy, phiếu lưu và popup in; tạo/sửa sản phẩm, upload banner, cập nhật công ty; tạo staff/giới hạn quyền/đổi mật khẩu/thu hồi; mobile không tràn ngang. Screenshot được tạo lại trong test-results/browser khi chạy.

Kiểm thử layout dùng Apache TLS riêng, private nằm trong document root và cả hai front controller đổi đúng đường dẫn như hướng dẫn. Tất cả URL trực tiếp config/src/SQL/ảnh-private/script trả 403/404; script không chạy. /uploads/tên-cũ trả đúng bytes. Cookie có Secure, HttpOnly, SameSite=Lax. Đường /admin và sản phẩm sâu trả React sau reload.

## Giới hạn chưa kiểm chứng

- Chưa đăng nhập hoặc triển khai P.A Việt Nam Business 2; chưa xác nhận PHP extensions, LiteSpeed/.htaccess, open_basedir, quyền filesystem, SSL/proxy, ModSecurity, CPU/RAM/IO/connections, dung lượng/inode, giới hạn SQL/upload hoặc cron của gói thật.
- Đã kiểm thử **MariaDB 10.11**, chưa chạy riêng MySQL 8.x, MariaDB 10.6 hoặc LiteSpeed. Schema dùng cú pháp tương thích yêu cầu ghi trong hướng dẫn, nhưng không coi đó là kết quả kiểm thử các phiên bản khác.
- Chưa chuyển hay đối chiếu dữ liệu `.local` thật. Phải diễn tập với bản sao dữ liệu thật và xác nhận counts/hashes/uploads trước khi mở ghi ở đích. Không có dữ liệu thật trong ZIP.
- Không kiểm thử thanh toán ngân hàng thật, DNS, SSL tên miền thật hoặc in giấy qua máy in vật lý. Đã kiểm tra popup/pre nội dung phiếu trên Chromium; chuyển khoản giữ quy trình thủ công của bản gốc.
- Chưa đo tải dài hạn hoặc benchmark hạn mức shared hosting. Khóa chung bảo đảm tính đúng trong thử nghiệm đồng thời; không cam kết thông lượng của Business 2.
- Chưa xây CRM/Excel. Kiến trúc và hướng thêm bảng/chỉ mục/batch nằm trong KIEN-TRUC.md.

Đọc danh sách cần xác nhận với nhà cung cấp ở mục 1 HUONG-DAN.md. Không có hoạt động sửa DNS, mua dịch vụ, push/PR hay ghi production trong phiên này.
