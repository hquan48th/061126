# Fillico — bản phát hành đầu tiên

## Các luồng đã hoàn thiện

- **Giỏ hàng** hiển thị tên, phân loại, số lượng và tình trạng từng món. Khách có thể xóa hoặc giảm số lượng trước khi sang thanh toán. Giỏ được lưu riêng theo tài khoản.
- **Thanh toán** kiểm tra trạng thái bán, tồn, giá và phí giao hàng trên PHP. Khi giá hoặc phí thay đổi, khách thấy tổng cũ, tổng mới và các khoản thay đổi trong khi thông tin nhận hàng đã nhập được giữ lại. Khách phải bấm xác nhận tổng mới. Khi mất phản hồi, có thể gửi lại cùng yêu cầu để lấy đơn đã ghi. Mua ngay chỉ dùng phân loại đã chọn và giữ giỏ thường.
- **Đơn hàng của tôi** hiện trong menu Tài khoản, mỗi trang tối đa 12 đơn mới nhất. Chỉ chủ tài khoản xem được thông tin nhận hàng và chi tiết đơn. Sau khi đặt thành công, trình duyệt mở đơn vừa đặt. Đơn chuyển khoản chưa thanh toán hiển thị hướng dẫn chuyển khoản của cửa hàng.
- **Sản phẩm & kho** xuất `.xlsx` với hai sheet tiếng Việt. Tệp vừa xuất là mẫu nhập. Sau khi chọn tệp, bấm **Nhập Excel** để kiểm tra và lưu trong cùng yêu cầu. Nếu có lỗi, không dòng nào được ghi. Kết quả cho biết lỗi theo vị trí hoặc số sản phẩm, phân loại và dòng giữ nguyên. Việc nhập giữ nguyên ảnh, ảnh bìa và cấu hình cắt ảnh.

## Chạy thử và cài đặt

Với source và PHP portable trên Windows, nếu database thử đã cấu hình, chạy trong thư mục dự án. Nếu server PHP đang chạy đúng cổng, chạy hai lệnh đầu ở terminal khác rồi tải lại trang.

```powershell
.\work\runtime\php\php.exe tools/check.php
.\work\runtime\php\php.exe tools/migrate.php
.\work\runtime\php\php.exe -S 127.0.0.1:8000 -t public_html router.php
```

Mở [cửa hàng](http://127.0.0.1:8000/) và [Seller Center](http://127.0.0.1:8000/admin). Khi cài mới, tạo database trống, nhập lần lượt `001_initial.sql`, `002_customer_accounts.sql` và `003_customer_orders.sql` rồi chạy `/setup.php`. Xem [hướng dẫn cài đặt](HUONG-DAN.md).

Excel cần PHP bật `zip`, `dom` và ghi được thư mục tạm. Tệp tối đa **3 MiB**, tối đa **5.000 dòng dữ liệu mỗi sheet** và tối đa **10 MiB sau giải nén**. Chạy `php tools/check.php` để kiểm tra PHP CLI. Hãy thử xuất và nhập trên staging vì PHP web có thể dùng tệp cấu hình riêng.

## Kiểm tra trước khi mở bán

1. Trong **Sản phẩm & kho**, xuất Excel, sửa thử một tên hoặc SKU có số 0 đầu, rồi nhập trực tiếp. Sửa thêm một dòng thành tồn âm và kiểm tra tệp lỗi giữ nguyên các dòng hợp lệ.
2. Thêm hai phân loại vào giỏ, giảm tồn của một phân loại trong Seller Center, rồi mở lại giỏ. Kiểm tra tên, lý do, nút giảm và nút xóa.
3. Mở thanh toán, đổi phí giao hàng từ Seller Center, rồi thử đặt. Kiểm tra tổng cũ, tổng mới và dữ liệu nhận hàng.
4. Đặt một đơn và mở từ **Tài khoản → Đơn hàng của tôi**. Đăng nhập tài khoản khác trên cùng thiết bị rồi thử mở lại URL chi tiết đơn đó.

## Phạm vi xác minh

Ngày 21/11/2026, `tools/check.php` đạt. Bộ PHP đạt **42/42**. Bộ đầy đủ đạt **56/56**, gồm 42 ca PHP/API/SQL và 14 ca Chrome headless. Môi trường thử dùng PHP 8.3.36, MariaDB 10.11.19 với database riêng, và Chrome ở desktop và mobile 390 px. Log và ảnh trong `work/test-f71ba8810d`. Tệp xuất được mở, chỉnh sửa và lưu bằng openpyxl. PHP đọc lại được SKU `00007` dưới dạng văn bản.

Chưa xác minh Apache/LiteSpeed, HTTPS, cấu hình PHP web và giới hạn upload trên hosting thật. Microsoft Excel desktop và Safari/iOS vật lý cũng cần xác minh trên môi trường đích. Tài khoản người mua hiện chưa có đặt lại mật khẩu qua email.
