# Phạm vi chuyển sang PHP thuần

Yêu cầu: chạy và tiếp tục sửa bằng PHP trên hosting, bỏ backend/công cụ Node và frontend cần biên dịch.

Đã chọn PHP template phía server, CSS từ giao diện cũ và JavaScript trình duyệt trực tiếp. Giữ backend PHP/MySQL, thêm render/router local. Không thêm framework/Composer/dịch vụ nền.

Loại source Node/SQLite, React/TypeScript, package npm/Vite/Playwright và công cụ Node. Dữ liệu mặc định chuyển sang defaults.php. Kiểm tra/đóng gói/test HTTP/browser/chuyển SQLite cũ đều có công cụ PHP.

Markup/thao tác thay đổi: danh mục dùng GET, giỏ là trang riêng, admin dùng dialog native. Không coi giao diện là bản sao từng pixel của React; API và schema nghiệp vụ vẫn giữ.

Không triển khai hosting, sửa DNS hoặc nhập dữ liệu thật. Kết quả test cũ không tự áp dụng cho giao diện mới.
