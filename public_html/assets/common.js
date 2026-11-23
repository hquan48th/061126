'use strict';
// Browser JavaScript: served directly by PHP, no build step or dependencies.
window.Fillico = (() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = n => new Intl.NumberFormat('vi-VN').format(n) + '₫';
  const states = {pending:'Chờ xác nhận',confirmed:'Đã xác nhận',packing:'Đang chuẩn bị',shipping:'Đang giao hàng',delivered:'Đã giao hàng',cancelled:'Đã hủy'};
  const payments = {unpaid:'Chưa thanh toán',paid:'Đã thanh toán',refunded:'Đã hoàn tiền'};
  async function api(path, options = {}) {
    const headers = {...(options.body && typeof options.body === 'string' ? {'Content-Type':'application/json'} : {}), ...options.headers};
    const response = await fetch(path, {...options, headers, credentials:'same-origin'});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) window.dispatchEvent(new Event('fillico-session-expired'));
      throw Object.assign(new Error(body.error || 'Không thể xử lý yêu cầu. Vui lòng thử lại.'), {status:response.status, details:body});
    }
    return body;
  }
  const read = (storage, key, fallback) => { try { return JSON.parse(storage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
  function purgeExpiredCheckout() {
    try {
      for(const key of Object.keys(sessionStorage).filter(name=>name.startsWith('fillico-pending-checkout-v2:')||name==='fillico-pending-checkout-v1')){
        const pending=JSON.parse(sessionStorage.getItem(key)||'null');
        if(pending?.body&&typeof pending.createdAt==='number'&&Date.now()-pending.createdAt>1800000){
          pending.body=null;
          sessionStorage.setItem(key,JSON.stringify(pending));
        }
      }
    } catch { /* Checkout reports storage failures before sending any request. */ }
  }
  purgeExpiredCheckout();setInterval(purgeExpiredCheckout,10000);
  const uuid = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    return Array.from(bytes, (b,i) => ([4,6,8,10].includes(i)?'-':'') + b.toString(16).padStart(2,'0')).join('');
  };
  let timer;
  function toast(message) { const el=document.querySelector('#toast'); if(!el)return; el.textContent=message;el.hidden=false;clearTimeout(timer);timer=setTimeout(()=>{el.hidden=true;},4000); }
  function orderHtml(o) {
    return `<section class="order-result"><div class="order-result-header"><div><small>ĐƠN HÀNG</small><h2>${escape(o.code)}</h2></div><span class="order-status ${escape(o.status)}">${escape(states[o.status])}</span></div><p><strong>${escape(o.customer.name)}</strong> · ${escape(o.customer.phone)}</p><p>${escape(o.customer.address)}</p>${o.customer.note?`<p>Ghi chú: ${escape(o.customer.note)}</p>`:''}${o.items.map(i=>`<div class="order-item"><span>${escape(i.productName)}<small>${escape(i.variantName)} × ${i.quantity}</small></span><strong>${money(i.price*i.quantity)}</strong></div>`).join('')}<div class="order-total"><span>Tổng thanh toán <small>Phí giao hàng ${money(o.shippingFee)}</small></span><strong>${money(o.total)}</strong></div><p class="payment-state">${o.paymentMethod==='bank'?'Chuyển khoản':'Thanh toán khi nhận hàng'} · ${escape(payments[o.paymentStatus])}</p></section>`;
  }
  return {escape,money,states,payments,api,read,uuid,toast,orderHtml};
})();
