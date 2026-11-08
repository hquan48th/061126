import { useEffect, useState } from 'react';
import { FileText, Printer, Save, RotateCcw } from 'lucide-react';

type ReceiptOrder = { id: string; code: string; subtotal: number; shippingFee: number; total: number; createdAt: string; paymentMethod: string; customer: { name: string; phone: string; address: string; email?: string; note?: string }; items: { name?: string; productName?: string; variantName?: string; quantity: number; price?: number; unitPrice?: number }[] };
type ReceiptSettings = { storeName: string; companyName: string; address: string; phone: string; email: string; taxCode: string };
type Receipt = { content: string; updatedAt: string };
const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value) + ' đ';
function template(order: ReceiptOrder, settings: ReceiptSettings | null) {
  const header = [settings?.companyName || settings?.storeName || 'CỬA HÀNG', settings?.address && `Địa chỉ: ${settings.address}`, settings?.phone && `Điện thoại: ${settings.phone}`, settings?.email && `Email: ${settings.email}`, settings?.taxCode && `Mã số thuế: ${settings.taxCode}`].filter(Boolean).join('\n');
  const lines = order.items.map((item, index) => `${index + 1}. ${item.productName || item.name || 'Sản phẩm'}${item.variantName ? ` — ${item.variantName}` : ''}\n   ${item.quantity} × ${money(item.unitPrice ?? item.price ?? 0)} = ${money((item.unitPrice ?? item.price ?? 0) * item.quantity)}`).join('\n\n');
  return `${header}\n\nPHIẾU BÁN HÀNG\nMã đơn: ${order.code}\nNgày đặt: ${new Date(order.createdAt).toLocaleString('vi-VN')}\n\nKhách hàng: ${order.customer.name}\nĐiện thoại: ${order.customer.phone}\nĐịa chỉ: ${order.customer.address}${order.customer.email ? `\nEmail: ${order.customer.email}` : ''}\n\n────────────────────────────────────────\nSẢN PHẨM\n\n${lines}\n────────────────────────────────────────\nTiền hàng: ${money(order.subtotal)}\nPhí vận chuyển: ${money(order.shippingFee)}\nTỔNG CỘNG: ${money(order.total)}\nThanh toán: ${order.paymentMethod === 'bank' ? 'Chuyển khoản' : 'Thanh toán khi nhận hàng'}${order.customer.note ? `\nGhi chú đơn hàng: ${order.customer.note}` : ''}\n\nCảm ơn quý khách đã mua hàng!`;
}
async function request(url: string, options?: RequestInit) {
  const res = await fetch(url, { credentials: 'same-origin', ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { if (res.status === 401) window.dispatchEvent(new Event('fillico-session-expired')); throw new Error(data.error || 'Không thể xử lý yêu cầu. Vui lòng thử lại.'); }
  return data;
}
export default function ReceiptEditor({ order, settings, close, onDirtyChange }: { order: ReceiptOrder; settings: ReceiptSettings | null; close: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const [content, setContent] = useState(''), [savedContent, setSavedContent] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const path = `/api/admin/orders/${encodeURIComponent(order.id)}/receipt`;
  useEffect(() => { let active = true; request(path).then(({ receipt }: { receipt: Receipt | null }) => { if (active) { const initial = receipt?.content ?? template(order, settings); setContent(initial); setSavedContent(initial); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [order.id]);
  useEffect(() => { onDirtyChange(!loading && content !== savedContent); }, [content, savedContent, loading]);
  async function save() {
    if (!content.trim()) throw new Error('Vui lòng nhập nội dung phiếu trước khi lưu.');
    await request(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    setSavedContent(content); setNotice('Đã lưu nội dung phiếu cho đơn hàng này.');
  }
  async function saveOnly() { setBusy(true); setError(''); setNotice(''); try { await save(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function print() {
    setError(''); setNotice('');
    const popup = window.open('', '_blank');
    if (!popup) { setError('Trình duyệt đang chặn cửa sổ in. Hãy cho phép cửa sổ bật lên rồi thử lại.'); return; }
    setBusy(true);
    try {
      await save();
      const doc = popup.document; doc.title = `Phieu-ban-hang-${order.code}`;
      const meta = doc.createElement('meta'); meta.setAttribute('charset', 'utf-8'); doc.head.appendChild(meta);
      const style = doc.createElement('style'); style.textContent = '@page{size:A4;margin:15mm}body{margin:0;color:#111;font:14px/1.55 Arial,sans-serif}main{max-width:180mm;margin:0 auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:0}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}'; doc.head.appendChild(style);
      const main = doc.createElement('main'); const pre = doc.createElement('pre'); pre.textContent = content; main.appendChild(pre); doc.body.replaceChildren(main);
      popup.focus(); popup.print();
    } catch (e) { popup.close(); setError((e as Error).message); } finally { setBusy(false); }
  }
  function exit() { close(); }
  return <div className="receipt-editor"><div className="receipt-intro"><FileText size={20}/><div><strong>Mẫu phiếu bán hàng · {order.code}</strong><p>Chỉnh trực tiếp mọi nội dung bên dưới, rồi lưu hoặc in. Thay đổi trên phiếu không làm thay đổi đơn hàng hay tồn kho.</p></div></div>{loading ? <p className="receipt-loading">Đang tải mẫu phiếu…</p> : <><label className="receipt-label" htmlFor="receipt-content">Nội dung phiếu</label><textarea id="receipt-content" className="receipt-paper" value={content} onChange={e => { setContent(e.target.value); setNotice(''); }} maxLength={30000} spellCheck={false}/><p className="receipt-help">Bạn có thể sửa, xóa hoặc thêm dòng tùy ý. Tổng tiền trên phiếu không tự tính lại khi sửa nội dung.</p><button type="button" className="ad-text-button" onClick={() => { if (window.confirm('Thay nội dung hiện tại bằng mẫu từ đơn hàng?')) setContent(template(order, settings)); }}><RotateCcw size={15}/> Khôi phục mẫu từ đơn hàng</button></>}{error && <p className="ad-error" role="alert">{error}</p>}{notice && <p className="receipt-notice" role="status">{notice}</p>}<div className="ad-modal-footer"><button type="button" className="ad-btn ad-outline" onClick={exit}>Quay lại đơn hàng</button><button type="button" className="ad-btn ad-outline" disabled={busy || loading} onClick={() => void saveOnly()}><Save size={17}/> Lưu phiếu</button><button type="button" className="ad-btn ad-primary" disabled={busy || loading} onClick={() => void print()}><Printer size={17}/> Lưu và in</button></div></div>;
}
