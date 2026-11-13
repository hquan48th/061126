# Khảo sát bản gốc

Nguồn: https://github.com/hquan48th/061126, nhánh main, commit `3d95cb782ed7843da043573e8dbd6b890667d860`.
Ngày khảo sát: 13/11/2026, giờ Việt Nam.

Không có AGENTS.md trong repository. Bản `/workspace/061126` có nhánh work chưa có commit, tất cả tệp nguồn chưa được Git theo dõi và giao diện khác GitHub. Bản chuyển đổi nằm riêng trong `/workspace/work/fillico-php`; không sửa nguồn hoặc dữ liệu `.local` cũ. Không đưa `.local` vào fixture hay gói bàn giao.

Frontend React 19 + TypeScript + Vite 6, React Router. Tất cả API dùng đường dẫn cùng origin `/api`. Phiên dùng cookie; quản trị fetch với `credentials: same-origin`. Upload gửi nguyên bytes, Content-Type image/png, image/jpeg hoặc image/webp, tối đa 5 MiB. Giỏ hàng/yêu thích/tra cứu lưu ở trình duyệt. Giao diện in tạo popup từ nội dung phiếu, không cần dịch vụ PDF.

Node 24 / Express 5: server/app.ts, server/store.ts; SQLite node:sqlite, WAL, BEGIN IMMEDIATE. 9 bảng: products, variants, settings, orders, order_receipts, idempotency, users, sessions, audit. Các đối tượng nghiệp vụ lưu JSON. Thứ tự sản phẩm/phân loại/đơn/nhân viên theo rowid. Mật khẩu scrypt với salt dạng hex nhưng truyền như chuỗi vào Node.

API công khai: GET health, store; POST auth/login; GET orders/:code?token; POST orders. API phiên: GET auth/me; POST auth/logout, auth/password. Nhân viên: GET admin/orders; PATCH admin/orders/:id; GET/PUT admin/orders/:id/receipt. Chủ shop: GET admin/dashboard; GET/POST admin/products; PUT/DELETE admin/products/:id; GET/PUT admin/settings; POST admin/uploads; GET/POST admin/staff; DELETE admin/staff/:id. Không có API hoặc màn hình đọc audit ở bản gốc; chỉ ghi nhật ký database và phải giữ.

Quy tắc: backend tính tiền nguyên VND, gộp phân loại trùng, tối đa 999/loại và 100 dòng. Phí giao hàng theo settings, ngưỡng 0 tắt miễn phí. COD và chuyển khoản thủ công (chỉ khi có bankInfo). Token tra cứu 32 bytes ngẫu nhiên, database giữ SHA256. Idempotency lưu cả phản hồi/token gốc. Đơn pending → confirmed → packing → shipping → delivered; được hủy từ pending/confirmed/packing, không mở lại. Hoàn tồn đúng một lần. Hoàn tiền chỉ cho đơn đã trả tiền và đã hủy; không lùi paid về unpaid hoặc refunded về trạng thái khác.

Sản phẩm có revision chống lưu tồn kho từ form cũ; đặt/hủy cũng tăng revision. Không xóa phân loại đang có đơn chưa hoàn tất. DELETE sản phẩm chỉ ẩn. Nhân viên chỉ xử lý đơn/phiếu và đổi mật khẩu của mình; không đọc dashboard, cấu hình, sản phẩm quản trị hay nhân viên. Đổi mật khẩu và thu hồi nhân viên xóa các phiên liên quan. Phiếu tối đa 30.000 UTF-16 code units, lưu riêng không thay đổi tiền/tồn kho.

Baseline GitHub thực tế: 23/23 API tests, 5/5 Chromium tests, TypeScript/Vite build đạt. Baseline workspace cũ cũng đạt các kiểm thử này. Không phát hiện lỗi test có sẵn. Bản gốc chỉ kiểm tra chữ ký đầu ảnh và login rate limit ở RAM; bản PHP kiểm tra thêm finfo/kích thước pixel và lưu rate limit trong InnoDB.

Tiêu chí hoàn thành: API/JSON tương thích; mọi nghiệp vụ trên có đối chiếu test; thực sự kiểm thử InnoDB bằng request đồng thời; tạo schema/công cụ chuyển có snapshot và đối chiếu; installer mới không seed sản phẩm; gói chỉ có frontend đã build và PHP cần chạy; có hướng dẫn cài đặt/cập nhật/sao lưu và liệt kê giới hạn kiểm chứng. Không cần thay frontend sản phẩm, không thêm CRM/Excel.
