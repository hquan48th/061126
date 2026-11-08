import type { Product, Settings } from '../shared/types.js';

export const defaultSettings: Settings = {
  storeName: 'FILLICO', tagline: 'Chăm chút từng trải nghiệm',
  phone: '', email: '', address: '', companyName: 'FILLICO', taxCode: '',
  heroTitle: 'Tinh tế trong từng chi tiết.',
  heroSubtitle: 'Đồ dùng khách sạn & chăm sóc không gian. Chất lượng chỉn chu, để mỗi lần lưu trú là một trải nghiệm đáng nhớ.',
  heroImage: '/images/hero-hospitality.png', heroEnabled: true, shippingFee: 30000, freeShippingThreshold: 1000000, bankInfo: '',
  policies: {
    'giao-hang': 'Phí vận chuyển tiêu chuẩn 30.000đ. Miễn phí vận chuyển cho đơn từ 1.000.000đ. Cửa hàng sẽ liên hệ xác nhận thời gian và địa chỉ giao hàng trước khi gửi đơn.',
    'doi-tra': 'Vui lòng kiểm tra hàng khi nhận và liên hệ cửa hàng nếu sản phẩm bị thiếu, hỏng hoặc giao sai. Giữ lại hóa đơn, bao bì và ảnh sản phẩm để được hỗ trợ. Chủ cửa hàng cần cập nhật điều kiện đổi trả chính thức trước khi mở bán.',
    'bao-mat': 'Thông tin liên hệ và địa chỉ được sử dụng để xác nhận, giao hàng và hỗ trợ đơn hàng. Chỉ nhân viên được phân quyền mới được truy cập. Liên hệ cửa hàng để yêu cầu cập nhật hoặc xóa thông tin theo quy định áp dụng.',
    'thanh-toan': 'Hỗ trợ thanh toán khi nhận hàng (COD). Chuyển khoản chỉ khả dụng sau khi cửa hàng cấu hình hướng dẫn thanh toán; trạng thái thanh toán được nhân viên xác nhận sau khi đối soát.',
  },
};
const rows = [
 ['ban-chai-tre', 'Bàn chải tre tự nhiên', 'Chăm sóc cá nhân', 'Bàn chải cán tre với đầu lông mềm, đóng gói riêng trong bao giấy. Lựa chọn chỉn chu cho phòng khách sạn, homestay và những chuyến đi.', 'toothbrush', 90000, 110000, 'Bán chạy', ['Bộ 20 chiếc', 'Bộ 50 chiếc']],
 ['khan-tam-cotton', 'Khăn tắm cotton cao cấp', 'Khăn & vải', 'Sợi cotton mềm mại, thấm hút tốt và dịu nhẹ với làn da. Đường may chắc chắn cùng sắc màu trung tính dễ phối với mọi không gian.', 'towel', 159000, 199000, 'Yêu thích', ['Trắng ngà · 70 × 140 cm', 'Be · 70 × 140 cm']],
 ['bo-dau-goi-sua-tam', 'Bộ dầu gội & sữa tắm Botanica', 'Chăm sóc cá nhân', 'Hương thảo mộc nhẹ nhàng mang đến phút thư giãn sau ngày dài. Thiết kế chai tối giản, phù hợp phòng tắm khách sạn và căn hộ.', 'bodywash', 245000, 290000, 'Mới', ['Bộ 2 chai · 300 ml', 'Bộ 2 chai · 500 ml']],
 ['binh-nhan-su', 'Bình nhấn sứ tối giản', 'Phụ kiện phòng tắm', 'Bình sứ tráng men với vòi nhấn tiện dụng cho nước rửa tay, dầu gội hoặc sữa tắm. Bề mặt dễ vệ sinh và thiết kế gọn gàng.', 'dispenser', 129000, 159000, '', ['Trắng kem · 350 ml', 'Xanh olive · 350 ml']],
 ['dep-di-trong-phong', 'Dép vải đi trong phòng', 'Tiện nghi phòng', 'Dép mềm, nhẹ với đế chống trượt. Đóng gói theo đôi, dễ sắp xếp cho phòng lưu trú và phòng spa.', 'slippers', 35000, 45000, '', ['Trắng ngà · Size M', 'Trắng ngà · Size L']],
 ['nuoc-lau-san', 'Nước lau sàn hương thảo mộc', 'Vệ sinh không gian', 'Làm sạch sàn và lưu lại hương thơm nhẹ. Can dung tích lớn phù hợp nhu cầu sử dụng thường xuyên tại khách sạn và nhà ở.', 'floor', 120000, 150000, 'Tiết kiệm', ['Can 3.8 lít', 'Can 5 lít']],
 ['bo-amenities', 'Bộ amenities Essential', 'Chăm sóc cá nhân', 'Bộ vật dụng cá nhân gồm bàn chải, lược, mũ tắm và tăm bông. Bao bì kraft đồng bộ giúp phòng nghỉ thêm gọn gàng, chỉn chu.', 'amenities', 185000, 220000, '', ['Hộp 10 bộ', 'Hộp 25 bộ']],
 ['khan-mat-cotton', 'Khăn mặt cotton mềm mại', 'Khăn & vải', 'Khăn mặt cotton thấm hút nhanh, mềm mại. Kích thước nhỏ gọn dành cho phòng tắm, phòng gym hoặc spa.', 'towel-small', 45000, 55000, '', ['Trắng · 30 × 50 cm', 'Be · 30 × 50 cm']],
 ['khay-go-phong-tam', 'Khay gỗ phòng tắm', 'Phụ kiện phòng tắm', 'Khay gỗ tông ấm để sắp xếp đồ dùng cá nhân, chai sữa tắm và khăn tay. Lau khô sau khi dùng để bảo quản bề mặt.', 'tray', 169000, 199000, 'Mới', ['Gỗ sáng · 25 cm', 'Gỗ sáng · 35 cm']],
 ['nuoc-rua-tay', 'Nước rửa tay Botanical', 'Chăm sóc cá nhân', 'Nước rửa tay hương nhẹ, vòi nhấn tiện dụng. Phù hợp khu vực lễ tân, bồn rửa và phòng tắm.', 'bottle', 89000, 109000, '', ['Trà xanh · 300 ml', 'Cam bergamot · 300 ml']],
 ['ao-choang-tam', 'Áo choàng tắm cotton', 'Khăn & vải', 'Áo choàng cotton êm ái với dây buộc eo và túi tiện dụng. Món đồ nâng niu cảm giác nghỉ ngơi tại khách sạn hoặc ở nhà.', 'robe', 349000, 420000, '', ['Trắng ngà · M', 'Trắng ngà · L']],
 ['tui-giat-vai', 'Túi giặt vải khách sạn', 'Tiện nghi phòng', 'Túi vải có dây rút, thuận tiện thu gom quần áo giặt. Có thể tái sử dụng và gấp gọn khi không dùng.', 'laundry', 39000, 49000, '', ['Tự nhiên · 40 × 50 cm', 'Tự nhiên · 50 × 60 cm']],
] as const;
export const seedProducts: Product[] = rows.map((r, i) => ({
 id: `p${i + 1}`, slug: r[0], name: r[1], category: r[2], description: r[3],
 image: `/images/product-${r[4]}.svg`, images: [`/images/product-${r[4]}.svg`], badge: r[7],
 featured: i < 4, active: true,
 variants: r[8].map((name, j) => ({ id: `v${i + 1}-${j + 1}`, name, sku: `FL-${String(i + 1).padStart(3, '0')}-${j + 1}`, price: Math.round(r[5] * (j ? 1.35 : 1) / 1000) * 1000, originalPrice: Math.round(r[6] * (j ? 1.35 : 1) / 1000) * 1000, stock: i === 10 ? 0 : 24 + i * 3 + j * 8 })),
}));
