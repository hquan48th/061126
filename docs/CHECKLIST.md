# Checklist PHP

- [ ] PHP/extensions/Argon2id và database/InnoDB đúng yêu cầu.
- [ ] DocumentRoot public_html, private/config/source/SQL trả 403/404.
- [ ] Origin khớp URL, HTTPS và allow_http=false trên hosting.
- [ ] Cài owner một lần; xóa setup.php/setup_token, giữ setup.lock.
- [ ] Trang chủ/danh mục/chi tiết/chính sách/deep link/404.
- [ ] Tìm không dấu, lọc giá/tồn/mới/ưu đãi/yêu thích; giỏ sau reload.
- [ ] Chọn phân loại, giá/tồn đúng; COD/chuyển khoản, tra cứu đúng token.
- [ ] Mất phản hồi checkout: replay cùng key/body/order, không trừ tồn hai lần.
- [ ] Yêu cầu hết 30 phút: xóa thông tin khách, xác nhận trước khi đặt mới.
- [ ] Revision/rollback, hủy hoàn tồn một lần, thanh toán/hoàn tiền đúng quy trình.
- [ ] Quản trị sản phẩm/phân loại/upload/banner/công ty/phí/ngân hàng/chính sách.
- [ ] Phiếu lưu riêng và in UTF-8; không thực thi nội dung như HTML.
- [ ] Staff chỉ xử lý đơn; đổi mật khẩu/thu hồi kết thúc phiên.
- [ ] Mobile không tràn trang; bảng quản trị cuộn trong vùng riêng.
- [ ] Backup/restore đủ database/config/uploads và gói không chứa dữ liệu riêng.
