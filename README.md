# Fillico — website bán hàng và quản trị cửa hàng

## Bản chuyển đổi PHP/MySQL cho shared hosting

Backend PHP nằm ở `php/`; React và API/JSON giữ theo commit nguồn. Bản Node trong `server/` được giữ làm tham chiếu. Không có thay đổi production, DNS, push hoặc PR trong bản bàn giao.

- [Cài đặt P.A Việt Nam, di chuyển, sao lưu, cập nhật](docs/HUONG-DAN.md)
- [Khảo sát nguồn và tiêu chí](docs/KHAO-SAT.md)
- [Checklist đối chiếu chức năng](docs/CHECKLIST.md)
- [Kết quả kiểm thử và giới hạn](docs/KIEM-THU.md)
- [Kiến trúc, mật khẩu cũ và hướng mở rộng](docs/KIEN-TRUC.md)

`npm run build:hosting` tạo `work/hosting` gồm `public_html` và `fillico-private` cùng cấp. Thư mục đích phải mới. Hosting không cần Node/Composer/Docker. Runtime yêu cầu PHP 8.3+ có Argon2id, pdo_mysql, mbstring, JSON, fileinfo; MySQL 8.0.16+ hoặc MariaDB 10.6+, InnoDB/utf8mb4.

Trên máy phát triển có Docker: `npm run build`, `npm run test:php:setup`, `npm run test:php`. Công cụ `tools/sqlite-to-mysql.mjs` chỉ đọc dữ liệu nguồn, tạo snapshot và SQL/đối chiếu vào thư mục riêng. Không coi clone GitHub là có `.local`. Mật khẩu scrypt cũ cần reset offline; đọc hướng dẫn trước khi nhập dữ liệu.

Phần dưới đây giữ lại hướng dẫn của backend Node để tham chiếu; không dùng cách chạy Node này trên hosting PHP.

Website tiếng Việt dành cho một cửa hàng, gồm giao diện mua sắm và trang `/admin` cho chủ shop/nhân viên. React + TypeScript + Vite chạy cùng máy chủ Express; dữ liệu lưu bền vững trong SQLite của Node.js.

## Chạy trên máy phát triển

Yêu cầu **Node.js 24 trở lên** và npm.

```bash
cd /workspace/061126
npm ci
npm run dev
```

Máy chủ mặc định dùng cổng `3000`. Có thể đặt biến `PORT` nếu cần đổi cổng. Đây là một máy chủ chung cho giao diện và API, không cần chạy hai tiến trình.

Lần khởi động đầu tạo dữ liệu mẫu và tài khoản chủ shop. Thông tin đăng nhập nằm trong `.local/admin-credentials.txt`; mở tệp này tại máy phát triển rồi đăng nhập trang `/admin`. Mật khẩu được sinh ngẫu nhiên và lưu trong cơ sở dữ liệu dưới dạng băm. Không chia sẻ, đưa tệp thông tin đăng nhập hoặc thư mục `.local` vào Git.

Chủ shop và nhân viên có thể chọn **Đổi mật khẩu** trong menu quản trị. Sau khi đổi, các phiên cũ kết thúc và cần đăng nhập lại; tệp thông tin ban đầu không được cập nhật thành mật khẩu mới.

## Kiểm tra và bản dựng

```bash
npm test
npm run build
npm run test:e2e
```

`npm test` kiểm tra các quy tắc API. `npm run build` kiểm tra TypeScript và tạo giao diện trong `dist`. Kiểm thử trình duyệt dùng Chromium tại `/usr/bin/chromium`, chạy máy chủ và cơ sở dữ liệu riêng để không sửa dữ liệu cửa hàng đang dùng. Có thể chọn đường dẫn Chromium bằng biến `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Bộ kiểm thử trình duyệt gồm tìm kiếm/lọc/yêu thích, chọn phân loại, giỏ hàng sau tải lại trang, đặt COD, tra cứu riêng tư, hủy đơn và hoàn tồn kho, quản trị sản phẩm/banner/thông tin công ty, phân quyền nhân viên, đổi mật khẩu và thu hồi quyền. Ảnh chụp giao diện máy tính/điện thoại được ghi trong `test-results/browser`; báo cáo nằm ở `playwright-report`.

Chạy bản dựng:

```bash
npm run build
npm start
```

## Quy trình sử dụng

- Khách tìm và lọc sản phẩm, chọn phân loại, thêm giỏ hàng, nhập thông tin giao hàng và đặt đơn COD.
- Giá và số lượng tồn được kiểm tra tại máy chủ khi đặt hàng. Thay đổi giá trong trình duyệt không thay đổi giá đơn hàng.
- Khách dùng đường dẫn tra cứu có mã bí mật sau khi đặt đơn để xem trạng thái. Không chia sẻ đường dẫn này vì nó cấp quyền xem thông tin đơn.
- Chủ shop quản lý sản phẩm/phân loại, ảnh, tồn kho, banner, thông tin công ty ở chân trang, phí giao hàng, hướng dẫn chuyển khoản và chính sách.
- Nhân viên chỉ được truy cập chức năng xử lý đơn hàng; các chức năng cấu hình và sản phẩm dành cho chủ shop.
- Trong chi tiết đơn chọn **In / chỉnh sửa phiếu** để chỉnh nội dung, lưu riêng theo từng đơn và in hoặc lưu PDF qua trình duyệt. Phiếu là chứng từ bán hàng, không phải hóa đơn điện tử; chỉnh nội dung không tự tính lại tổng và không sửa đơn hàng.
- Chủ shop có thể thu hồi tài khoản nhân viên; các phiên đăng nhập của tài khoản đó hết hiệu lực ngay.
- Chuyển khoản chỉ hiển thị sau khi cấu hình thông tin ngân hàng. Nhân viên cần đối soát tiền rồi mới xác nhận đã thanh toán.

## Dữ liệu và sao lưu

Thư mục `.local` chứa cơ sở dữ liệu và tệp cục bộ của cửa hàng, được loại khỏi Git. Dữ liệu vẫn còn sau khi khởi động lại máy chủ. Khi triển khai cần gắn thư mục dữ liệu vào ổ đĩa bền vững; không dùng hệ thống tệp tạm thời của hàm serverless.

Có thể đặt `DATA_DIR` thành đường dẫn tuyệt đối tới ổ đĩa bền vững. Mặc định là `/workspace/061126/.local` khi chạy từ checkout này. Đổi `DATA_DIR` sang thư mục trống sẽ tạo một cửa hàng mẫu mới, không di chuyển dữ liệu cũ.

Để sao lưu đơn giản, dừng máy chủ rồi sao chép toàn bộ thư mục dữ liệu, bao gồm ảnh tải lên và tệp SQLite. Khởi động lại máy chủ sau khi sao lưu. Muốn sao lưu khi máy chủ đang hoạt động cần dùng cơ chế backup của SQLite; không chỉ sao chép tệp `.sqlite` trong lúc còn giao dịch/WAL.

Mỗi lần khôi phục hoặc đổi dữ liệu cấu hình cần xác nhận lại đường dẫn lưu trữ và quyền truy cập. Giữ bản sao lưu ở vị trí có kiểm soát truy cập vì có thông tin khách hàng.

## Trước khi mở bán thật

Danh mục, giá, tồn kho và chính sách ban đầu là **dữ liệu minh họa**, không phải hàng hóa hoặc cam kết kinh doanh đã được xác nhận. Chủ shop cần cập nhật:

1. Sản phẩm, biến thể, giá, ảnh và tồn kho thực tế.
2. Tên pháp lý, địa chỉ, số điện thoại, email, mã số thuế và chính sách áp dụng.
3. Phí vận chuyển, ngưỡng miễn phí và hướng dẫn thanh toán.
4. Tên miền, HTTPS, ổ đĩa bền vững, sao lưu, giám sát lỗi và tài khoản nhân viên.

Phần thanh toán hiện hỗ trợ COD và chuyển khoản được xác nhận thủ công; chưa kết nối cổng thanh toán, đơn vị vận chuyển hoặc gửi email/SMS tự động. Tính năng quản trị chỉ dành cho một cửa hàng, không có mô hình nhiều nhà bán hoặc chia hoa hồng. Kho mã này chưa được triển khai lên dịch vụ hosting hay công bố website.

Banner và minh họa sản phẩm lưu trực tiếp trong `public/images`; nguồn và phạm vi sử dụng hình minh họa được ghi ở `public/images/README.md`. Cần thay bằng ảnh đúng hàng hóa trước khi mở bán.

Mỗi tác vụ cloud đã có môi trường tách biệt. Dùng checkout hiện có; không cần tạo Git worktree trừ khi được yêu cầu.
