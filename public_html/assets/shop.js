'use strict';
(() => {
  const {escape:e,money,api,read,uuid,toast,orderHtml} = Fillico;
  const data=JSON.parse(document.querySelector('#store-data').textContent);
  let products=data.products, settings=data.settings;
  const customer=data.customer;
  let cart=data.cart||[];
  let cartReview=data.cartLines||[];
  let favorites=read(localStorage,'fillico-favorites',[]);
  favorites=Array.isArray(favorites)?favorites.filter(x=>typeof x==='string'):[];
  const params=new URLSearchParams(location.search);
  const intentKey='fillico-buyer-intent';
  const buyKey='fillico-buy-'+customer?.id;
  const pendingSlot='fillico-pending-checkout-v2:'+customer?.id;
  const direct=()=>params.get('mode')==='direct';
  const post=(path,body,headers={})=>api(path,{method:'POST',body:JSON.stringify(body),headers});
  function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{toast('Trình duyệt không lưu được dữ liệu; hãy giữ trang này mở.');}}
  function requireLogin(next=''){
    location.assign('/dang-nhap'+(next?'?next='+next:''));
  }
  async function changeCart(action,variantId,quantity){
    return post('/api/customer/cart',{action,variantId,quantity},{'X-Fillico-Buyer':customer.id});
  }
  async function perform(intent){
    const result=await changeCart(intent.action,intent.variantId,intent.quantity);
    if(intent.action==='buy'){
      sessionStorage.setItem(buyKey,JSON.stringify(result.item));
      location.assign('/thanh-toan?mode=direct');
    }else{
      cart=result.items;
      updateCart();
      toast('Đã thêm sản phẩm vào giỏ hàng');
    }
  }
  const authForm=document.querySelector('#buyer-form');
  if(authForm){
    const destinations={cart:'/gio-hang',checkout:'/thanh-toan',direct:'/thanh-toan?mode=direct',orders:'/tai-khoan/don-hang'};
    const next=Object.hasOwn(destinations,params.get('next'))?params.get('next'):'';
    if(next)for(const link of authForm.closest('section').querySelectorAll('a'))link.search='?next='+next;
    authForm.addEventListener('submit',async event=>{
      event.preventDefault();
      const button=authForm.querySelector('button'), error=authForm.querySelector('[data-buyer-error]');
      button.disabled=true;error.hidden=true;
      try{
        await post('/api/customer/'+authForm.dataset.action,Object.fromEntries(new FormData(authForm)));
        const intent=read(sessionStorage,intentKey,null);
        const productPath=intent?.path;
        location.assign(typeof productPath==='string'&&/^\/san-pham\/[a-z0-9-]+$/.test(productPath)&&Date.now()-intent.createdAt<1800000
          ? productPath+'?resume=1' : destinations[next]||'/');
      }catch(err){error.textContent=err.message;error.hidden=false;button.disabled=false;}
    });
    authForm.querySelector('button').disabled=false;
  }
  const logout=document.querySelector('[data-buyer-logout]');
  logout?.addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;
    try {
      await post('/api/customer/logout',{});
      sessionStorage.removeItem(intentKey);
      sessionStorage.removeItem(buyKey);
      location.assign('/');
    } catch(err){toast(err.message);button.disabled=false;}
  });
  if(logout)logout.disabled=false;
  function readPending(){
    let raw;try{raw=sessionStorage.getItem(pendingSlot);}catch{throw new Error('Cần cho phép lưu trữ phiên để đặt hàng an toàn.');}
    if(!raw)return null;
    let p;try{p=JSON.parse(raw);}catch{throw new Error('Dữ liệu yêu cầu chờ không hợp lệ. Hãy liên hệ cửa hàng trước khi đặt lại.');}
    if(!p||typeof p.key!=='string'||typeof p.createdAt!=='number')throw new Error('Dữ liệu yêu cầu chờ không hợp lệ. Hãy liên hệ cửa hàng.');
    if(Date.now()-p.createdAt>1800000&&p.body){p.body=null;sessionStorage.setItem(pendingSlot,JSON.stringify(p));}
    return p;
  }
  function visibleLine(item){
    for(const product of products){
      const variant=product.variants.find(v=>v.id===item.variantId);
      if(!variant)continue;
      const issue=!variant.stock?'sold-out':item.quantity>variant.stock?'stock':null;
      return {...item,productName:product.name,variantName:variant.name,slug:product.slug,image:product.image,price:variant.price,stock:variant.stock,issue};
    }
    return {...item,productName:'Sản phẩm đã chọn',variantName:'Phân loại không còn bán',issue:'missing'};
  }
  function totals(lines){
    const subtotal=lines.reduce((s,line)=>s+(line.price??0)*line.quantity,0);
    const shippingFee=settings.freeShippingThreshold>0&&subtotal>=settings.freeShippingThreshold?0:settings.shippingFee;
    return {subtotal,shippingFee,total:subtotal+shippingFee};
  }
  function summaryHtml(t){return `<div class="cart-summary"><div><span>Tạm tính</span><span>${money(t.subtotal)}</span></div><div><span>Vận chuyển</span><span>${t.shippingFee?money(t.shippingFee):'Miễn phí'}</span></div><div class="summary-total"><span>Tổng thanh toán</span><strong>${money(t.total)}</strong></div></div>`;}
  function updateCart(){document.querySelectorAll('[data-cart-count]').forEach(el=>{el.textContent=cart.reduce((n,l)=>n+l.quantity,0);});}
  function issueText(line){
    if(line.issue==='stock')return 'Chỉ còn '+line.stock+' sản phẩm.';
    return {hidden:'Sản phẩm đang ẩn.',deleted:'Sản phẩm đã được xóa.',missing:'Phân loại không còn bán.','sold-out':'Hết hàng.'}[line.issue]||'';
  }
  function updateFavorites(){
    document.querySelectorAll('[data-favorite]').forEach(el=>{const active=favorites.includes(el.dataset.favorite);el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));});
    const grid=document.querySelector('[data-favorites-only]');
    if(grid){let count=0;grid.querySelectorAll('[data-product-id]').forEach(el=>{el.hidden=!favorites.includes(el.dataset.productId);if(!el.hidden)count++;});document.querySelector('[data-result-count]').textContent=count+' sản phẩm';document.querySelector('[data-catalog-empty]').hidden=count>0;}
  }
  document.addEventListener('click',event=>{
    const favorite=event.target.closest('[data-favorite]');
    if(favorite){const id=favorite.dataset.favorite;favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];write('fillico-favorites',favorites);updateFavorites();}
    const gallery=event.target.closest('[data-gallery]');if(gallery)document.querySelector('#detail-image').src=gallery.dataset.gallery;
    const menu=event.target.closest('[data-menu]');if(menu){const nav=document.querySelector('.navigation');nav.classList.toggle('is-open');menu.setAttribute('aria-expanded',String(nav.classList.contains('is-open')));}
  });
  updateCart();updateFavorites();
  const detail=document.querySelector('[data-detail]');
  if(detail){
    const product=products.find(p=>p.id===detail.dataset.detail), choice=document.querySelector('#variant-choice'), form=document.querySelector('#add-product');
    const selected=()=>product.variants.find(v=>v.id===choice.value);
    const quantityField=form.elements.quantity;
    let busy=false;
    function update(){
      const variant=selected();
      document.querySelector('#variant-price').textContent=money(variant.price);
      document.querySelector('#variant-original').textContent=variant.originalPrice>variant.price?money(variant.originalPrice):'';
      document.querySelector('#variant-stock').textContent=variant.stock?'Còn '+variant.stock+' sản phẩm · SKU: '+variant.sku:'Tạm hết hàng';
      quantityField.max=Math.min(999,variant.stock);
      for(const button of form.querySelectorAll('button[type=submit]'))button.disabled=busy||variant.stock===0;
    }
    async function handle(intent){
      if(busy)return;
      busy=true;update();
      try{await perform(intent);}catch(err){
        if(err.status===401){sessionStorage.setItem(intentKey,JSON.stringify(intent));requireLogin();}
        else toast(err.message);
      }finally{busy=false;update();}
    }
    choice.addEventListener('change',update);update();
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const intent={variantId:choice.value,quantity:Number(quantityField.value),action:event.submitter?.value==='buy'?'buy':'add',path:location.pathname,createdAt:Date.now()};
      if(!Number.isInteger(intent.quantity)||intent.quantity<1||intent.quantity>Math.min(999,selected().stock)){toast('Số lượng vượt quá tồn kho.');return;}
      if(!customer){
        try{sessionStorage.setItem(intentKey,JSON.stringify(intent));requireLogin();}
        catch{toast('Không lưu được lựa chọn. Hãy mở trang Đăng nhập rồi chọn lại sản phẩm.');}
        return;
      }
      void handle(intent);
    });
    if(customer&&params.has('resume')){
      const intent=read(sessionStorage,intentKey,null);
      history.replaceState(null,'',location.pathname);
      if(intent?.path===location.pathname&&Date.now()-intent.createdAt<1800000&&['add','buy'].includes(intent.action)){
        sessionStorage.removeItem(intentKey);
        if(product.variants.some(variant=>variant.id===intent.variantId)){choice.value=intent.variantId;quantityField.value=intent.quantity;update();}
        void handle(intent);
      }
    }
  }
  const cartRoot=document.querySelector('#cart-content');
  function renderCart(){
    if(!customer){cartRoot.innerHTML='<div class="empty-state"><h2>Đăng nhập để mở giỏ hàng</h2><a class="btn btn-primary" href="/dang-nhap?next=cart">Đăng nhập</a></div>';return;}
    if(!cart.length){cartRoot.innerHTML='<div class="empty-state"><h2>Giỏ hàng đang trống</h2><p>Chọn sản phẩm trước khi đặt hàng.</p><a class="btn btn-primary" href="/san-pham">Xem sản phẩm</a></div>';return;}
    const blocked=cartReview.some(line=>line.issue);
    cartRoot.innerHTML=cartReview.map(line=>{
      const id=e(line.variantId),name=e(line.productName);
      return `<div class="php-cart-line" data-cart-line="${id}">
        ${line.image?`<img src="${e(line.image)}" alt="">`:'<span class="cart-image-placeholder" aria-hidden="true"></span>'}
        <div>${line.slug?`<a href="/san-pham/${e(line.slug)}"><strong>${name}</strong></a>`:`<strong>${name}</strong>`}
          <small>${e(line.variantName)}</small>${line.issue?`<small class="cart-line-issue">${issueText(line)}</small>`:''}
          ${line.issue==='stock'?`<button type="button" class="text-link" data-reduce="${id}" data-stock="${line.stock}">Giảm còn ${line.stock}</button>`:''}
        </div>
        ${line.stock?`<input type="number" min="1" max="${Math.min(999,line.stock)}" value="${line.quantity}" data-cart-quantity="${id}" aria-label="Số lượng ${name}">`:`<span>Số lượng ${line.quantity}</span>`}
        <strong>${line.price===null?'':money(line.price*line.quantity)}</strong>
        <button type="button" class="icon-btn" data-remove="${id}" aria-label="Xóa ${name}">✕</button>
      </div>`;
    }).join('')+`<aside class="php-cart-summary">${blocked
      ?'<p>Hãy xử lý các món được đánh dấu trước khi đặt hàng.</p><button type="button" class="btn btn-primary full-width" disabled>Tiến hành đặt hàng</button>'
      :summaryHtml(totals(cartReview))+'<a class="btn btn-primary full-width" href="/thanh-toan">Tiến hành đặt hàng →</a>'}
      <a class="text-link" href="/san-pham">Tiếp tục mua sắm</a></aside>`;
  }
  if(cartRoot){
    let changing=false;
    renderCart();
    async function updateLine(action,id,quantity){
      if(changing)return;
      changing=true;
      cartRoot.querySelectorAll('button,input').forEach(control=>{control.disabled=true;});
      try{
        const result=await changeCart(action,id,quantity);
        cart=result.items;cartReview=result.lines;
      }catch(err){
        if(err.status===401){requireLogin('cart');return;}
        toast(err.message);
        try{
          const latest=await api('/api/customer/cart',{headers:{'X-Fillico-Buyer':customer.id}});
          cart=latest.items;cartReview=latest.lines;
        }catch{}
      }
      finally{changing=false;updateCart();renderCart();}
    }
    cartRoot.addEventListener('change',event=>{
      const id=event.target.dataset.cartQuantity;
      if(id)void updateLine('set',id,Number(event.target.value));
    });
    cartRoot.addEventListener('click',event=>{
      if(changing){event.preventDefault();return;}
      const button=event.target.closest('[data-remove]');
      if(button)void updateLine('remove',button.dataset.remove);
      const reduce=event.target.closest('[data-reduce]');
      if(reduce)void updateLine('set',reduce.dataset.reduce,Number(reduce.dataset.stock));
    });
  }
  const checkout=document.querySelector('#checkout-form');
  if(checkout){
    const error=document.querySelector('#checkout-error'),button=document.querySelector('#checkout-submit'),notice=document.querySelector('#pending-notice');let busy=false;
    const recovery=document.querySelector('#checkout-recovery'),priceChange=document.querySelector('#checkout-price-change');
    const buyItem=direct()?read(sessionStorage,buyKey,null):null;
    const checkoutItems=()=> (direct()?(buyItem?[buyItem]:[]):cart).map(({variantId,quantity})=>({variantId,quantity}));
    let newQuote=null, checkoutIssues=null, cartChanged=false;
    checkout.elements.name.value=customer.name;
    checkout.elements.email.value=customer.email;
    function fieldError(name,message){
      const field=checkout.elements[name];
      document.querySelector('#checkout-'+name+'-error').textContent=message;
      if(message)field.setAttribute('aria-invalid','true');else field.removeAttribute('aria-invalid');
      return !message;
    }
    function validateShipping(){
      let phone=checkout.elements.phone.value.replace(/[\s-]+/gu,'');
      if(phone.startsWith('+84'))phone='0'+phone.slice(3);
      const phoneOK=fieldError('phone',/^0[35789][0-9]{8}$/.test(phone)?'':'Nhập đủ 10 chữ số của số di động Việt Nam, hoặc dạng +84 tương đương.');
      const addressOK=fieldError('address',checkout.elements.address.value.trim()?'':'Vui lòng nhập địa chỉ nhận hàng.');
      if(!phoneOK||!addressOK)checkout.elements[phoneOK?'address':'phone'].focus();
      return phoneOK&&addressOK;
    }
    for(const name of ['phone','address'])checkout.elements[name].addEventListener('input',()=>fieldError(name,''));
    function lock(p){
      for(const name of ['name','phone','email','address','note']){const field=checkout.elements[name];field.readOnly=!!p?.body;if(p?.body)field.value=p.body.customer[name]||'';}
      for(const field of checkout.querySelectorAll('[name=paymentMethod]')){field.disabled=!!p?.body;field.checked=p?.body?field.value===p.body.paymentMethod:field.checked;}
      if(!p){notice.replaceChildren();return;}
      notice.innerHTML=p.body?'<p>Có yêu cầu chưa xác định kết quả. Bấm gửi lại sẽ dùng đúng thông tin và mã yêu cầu đã lưu, tránh tạo đơn trùng.</p>':'<p>Thông tin yêu cầu chờ đã được xóa sau 30 phút. Kiểm tra đơn cũ với cửa hàng trước khi đặt mới.</p><button type="button" class="btn btn-outline" id="new-checkout">Đã kiểm tra, bắt đầu lần đặt hàng mới</button>';
      document.querySelector('#new-checkout')?.addEventListener('click',()=>{if(confirm('Bạn đã kiểm tra đơn cũ với cửa hàng và muốn bắt đầu một lần đặt mới?')){try{sessionStorage.removeItem(pendingSlot);location.reload();}catch(err){error.textContent=err.message;}}});
    }
    function checkoutQuote(pending){
      if(newQuote&&!pending?.body)return newQuote;
      const byId=new Map(cartReview.map(line=>[line.variantId,line]));
      const items=pending?.body?.items||checkoutItems();
      const lines=items.map(item=>direct()?visibleLine(item):{...(byId.get(item.variantId)||visibleLine(item)),quantity:item.quantity});
      const original=pending?.body?.expectedQuote;
      if(!original)return {...totals(lines),lines};
      const prices=new Map(original.prices.map(item=>[item.variantId,item.price]));
      return {...original,total:original.subtotal+original.shippingFee,lines:lines.map(line=>({...line,price:prices.get(line.variantId)}))};
    }
    function showQuoteChange(before,after){
      const changes=[];
      if(before.subtotal!==after.subtotal)changes.push('Tiền hàng '+money(before.subtotal)+' → '+money(after.subtotal));
      if(before.shippingFee!==after.shippingFee)changes.push('Phí giao hàng '+money(before.shippingFee)+' → '+money(after.shippingFee));
      const prices=new Map(before.prices.map(item=>[item.variantId,item.price]));
      for(const line of after.lines){
        const price=prices.get(line.variantId);
        if(price!==line.price)changes.push(line.productName+' · '+line.variantName+' '+money(price)+' → '+money(line.price));
      }
      priceChange.innerHTML=`<div class="buyer-order-note"><strong>Giá hoặc phí giao hàng đã thay đổi</strong>
        <p>Tổng cũ ${money(before.subtotal+before.shippingFee)} · Tổng mới ${money(after.total)}</p>
        <ul>${changes.map(change=>`<li>${e(change)}</li>`).join('')}</ul><p>Kiểm tra số tiền rồi xác nhận đặt hàng.</p></div>`;
    }
    function renderCheckout(){
      let pending;try{pending=readPending();lock(pending);}catch(err){error.textContent=err.message;button.disabled=true;return;}
      const quote=checkoutQuote(pending), lines=quote.lines;
      const issues=checkoutIssues||lines.filter(line=>line.issue);
      const invalid=!lines.length||issues.length>0||cartChanged;
      document.querySelector('#checkout-lines').innerHTML=lines.map(line=>`<div class="checkout-line">${line.image?`<img src="${e(line.image)}" alt="">`:'<span></span>'}<div><strong>${e(line.productName)}</strong><small>${e(line.variantName)} × ${line.quantity}</small></div><span>${line.price==null?'':money(line.price*line.quantity)}</span></div>`).join('');
      document.querySelector('#checkout-total').innerHTML=!invalid||pending?.body?summaryHtml(quote):'';
      button.disabled=busy||(!pending?.body&&invalid)||!!(pending&&!pending.body);
      button.textContent=busy?'Đang đặt hàng…':pending?.body?'Gửi lại yêu cầu đã lưu':invalid?'Đặt hàng':(newQuote?'Xác nhận và đặt hàng · ':'Đặt hàng · ')+money(quote.total);
      recovery.replaceChildren();
      if(invalid&&!pending){
        const slug=direct()?(issues[0]?.slug||lines[0]?.slug):null;
        const link=direct()?(slug?'/san-pham/'+e(slug):'/san-pham'):'/gio-hang';
        const label=direct()?(slug?'Về trang sản phẩm':'Xem sản phẩm'):'Về giỏ hàng';
        recovery.innerHTML=`<div class="buyer-order-note"><p>${cartChanged?'Giỏ hàng đã thay đổi.':issues.length?'Vui lòng xử lý các món sau.':'Bạn chưa có sản phẩm để thanh toán.'}</p>
          ${issues.length?`<ul>${issues.map(line=>`<li><strong>${e(line.productName)} · ${e(line.variantName)}</strong><br>${issueText(line)}</li>`).join('')}</ul>`:''}
          <a class="text-link" href="${link}">${label}</a></div>`;
      }
    }
    renderCheckout();
    setInterval(()=>{if(!busy&&notice.firstElementChild&&!document.querySelector('#new-checkout'))renderCheckout();},10000);
    checkout.addEventListener('submit',async event=>{
      event.preventDefault();if(busy||button.disabled)return;error.textContent='';busy=true;
      let p,feedback;
      try{
        p=readPending();if(p&&!p.body)throw new Error('Yêu cầu cũ có thể đã tạo đơn. Hãy kiểm tra trước khi bắt đầu lần mới.');
        if(!p){
          if(!validateShipping()||!checkout.reportValidity())return;
          const form=new FormData(checkout),shipping={};for(const key of ['name','phone','email','address','note'])shipping[key]=String(form.get(key)||'').trim();
          const quote=checkoutQuote(null);
          const expectedQuote={subtotal:quote.subtotal,shippingFee:quote.shippingFee,prices:quote.lines.map(line=>({variantId:line.variantId,price:line.price}))};
          p={key:uuid(),createdAt:Date.now(),body:{customer:shipping,items:checkoutItems(),mode:direct()?'direct':'cart',paymentMethod:String(form.get('paymentMethod')),expectedTotal:quote.total,expectedQuote}};
          // Persistence must succeed before the request can be sent.
          sessionStorage.setItem(pendingSlot,JSON.stringify(p));
          priceChange.replaceChildren();
        }
        lock(p);button.disabled=true;button.textContent='Đang đặt hàng…';
        const result=await api('/api/orders',{method:'POST',headers:{'Idempotency-Key':p.key,'X-Fillico-Buyer':customer.id},body:JSON.stringify(p.body)});
        if(typeof result.order?.code!=='string')throw new Error('Chưa xác định được kết quả đặt hàng.');
        sessionStorage.removeItem(pendingSlot);if(p.body.mode==='direct')sessionStorage.removeItem(buyKey);
        location.assign('/tai-khoan/don-hang/'+encodeURIComponent(result.order.code)+'?dat-hang=1');
      }catch(err){
        if(err.status===401){requireLogin(direct()?'direct':'checkout');return;}
        const rejection=err.status>=400&&err.status<500&&![408,429].includes(err.status);
        if(rejection)sessionStorage.removeItem(pendingSlot);
        if(err.details?.reason==='quote_changed'){
          newQuote=err.details.quote;
          if(p.body.expectedQuote){showQuoteChange(p.body.expectedQuote,newQuote);feedback=priceChange;}
        }else if(err.details?.reason==='stock_changed'){
          checkoutIssues=err.details.lines;feedback=recovery;
        }else if(err.details?.reason==='cart_changed'){
          cartChanged=true;feedback=recovery;
        }else{
          error.textContent=!rejection&&p?.body?'Chưa xác định được kết quả. Hãy gửi lại yêu cầu đã lưu.':err.message;
        }
      }finally{
        busy=false;renderCheckout();
        if(feedback){feedback.tabIndex=-1;feedback.focus({preventScroll:true});feedback.scrollIntoView({block:'nearest'});}
      }
    });
  }
  const tracking=document.querySelector('#tracking-form');
  if(tracking){
    tracking.elements.code.value=params.get('code')||'';tracking.elements.token.value=params.get('token')||'';
    async function lookup(){
      const error=document.querySelector('#tracking-error'),root=document.querySelector('#tracking-result');error.textContent='';root.replaceChildren();const button=tracking.querySelector('button');button.disabled=true;
      try{const code=tracking.elements.code.value.trim(),token=tracking.elements.token.value.trim();const {order}=await api('/api/orders/'+encodeURIComponent(code)+'?token='+encodeURIComponent(token));root.innerHTML=orderHtml(order)+(order.paymentMethod==='bank'&&order.paymentStatus==='unpaid'?`<div class="bank-instructions"><h3>Thông tin chuyển khoản</h3><p>${e(settings.bankInfo).replaceAll('\n','<br>')}</p><p>Nội dung: <strong>${e(order.code)}</strong></p></div>`:'')+'<p class="secure-note">Giữ riêng mã tra cứu. Bất kỳ ai có mã này đều có thể xem thông tin đơn.</p>';history.replaceState(null,'','/tra-cuu?code='+encodeURIComponent(code)+'&token='+encodeURIComponent(token));}catch(err){error.textContent=err.message;}finally{button.disabled=false;}
    }
    tracking.addEventListener('submit',event=>{event.preventDefault();void lookup();});if(params.get('code')&&params.get('token'))void lookup();
  }
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  window.addEventListener('storage',event=>{if(event.key==='fillico-favorites'){const latest=read(localStorage,'fillico-favorites',[]);favorites=Array.isArray(latest)?latest.filter(x=>typeof x==='string'):[];updateFavorites();}});
})();
