# Gói hosting Fillico PHP

`fillico-hosting.zip` chứa website, ba tệp SQL cài đặt và hướng dẫn. Cần PHP 8.3+ và MySQL/MariaDB. Excel cần `zip`, `dom` và quyền ghi thư mục tạm của PHP. Website chạy trực tiếp với PHP, CSS và JavaScript trình duyệt.

Giải nén và xem `docs/HUONG-DAN.md`. Nhập 001, 002 và 003 theo thứ tự vào database trống. Tải nội dung `public_html` vào webroot, đặt `fillico-private` cùng cấp, cấu hình database và chạy `/setup.php`.

Ngày 21/11/2026, bộ kiểm thử đạt 56/56 trên PHP 8.3.36, MariaDB 10.11.19 và Chrome headless. Cấu hình HTTPS và rewrite trên hosting thực tế cần kiểm tra trên staging. Xem `docs/BAO-CAO-CAP-NHAT.md` trong gói.

Mã SHA-256 của gói nằm trong `SHA256SUMS`. `BUILD.json` bên trong ghi mã kiểm tra từng file. Có thể đóng gói lại từ source bằng `php tools/package.php /NEW/output-directory`.
