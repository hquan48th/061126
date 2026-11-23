'use strict';
(() => {
  const {escape:e,money,api,uuid,toast,states,payments,orderHtml,icon}=Fillico;
  const root=document.querySelector('#admin-root');
  const transitions={pending:['confirmed','cancelled'],confirmed:['packing','cancelled'],packing:['shipping','cancelled'],shipping:['delivered'],delivered:[],cancelled:[]};
  const policyNames={'giao-hang':'Chính sách giao hàng','doi-tra':'Chính sách đổi trả','bao-mat':'Chính sách bảo mật','thanh-toan':'Hướng dẫn thanh toán'};
  let user=null,settings=null,products=[],orders=[],staff=[],tab='dashboard',generation=0;
  const navigation=[
    {id:'dashboard',title:'Tổng quan',icon:'dashboard'},
    {id:'orders',title:'Đơn hàng',icon:'bag'},
    {id:'products',title:'Sản phẩm & kho',icon:'package'},
    {id:'banner',title:'Banner trang chủ',icon:'image',group:'CỬA HÀNG'},
    {id:'settings',title:'Thông tin & cài đặt',icon:'settings'},
    {id:'staff',title:'Nhân viên',icon:'users'}
  ];
  const names=Object.fromEntries(navigation.map(item=>[item.id,item.title]));
  const descriptions={dashboard:'Cùng theo dõi hoạt động kinh doanh của cửa hàng hôm nay.',orders:'Theo dõi và chăm sóc từng đơn hàng, từ lúc đặt đến khi giao.',products:'Quản lý sản phẩm, phân loại và số lượng tồn kho ở một nơi.',banner:'Tạo ấn tượng đầu tiên thật đẹp cho khách ghé thăm cửa hàng.',settings:'Thông tin công ty được hiển thị tập trung ở chân trang.',staff:'Cấp quyền phù hợp để đội ngũ cùng vận hành cửa hàng.'};
  const actionIcons={'Đăng nhập':'arrow-right','Thử lại':'refresh','Xem đơn':'eye','In / chỉnh sửa phiếu':'printer','Cập nhật đơn hàng':'check','Khôi phục mẫu từ đơn hàng':'rotate','Lưu phiếu':'save','Lưu và in':'printer','Thêm sản phẩm':'plus','Chỉnh sửa':'pencil','Ẩn':'eye-off','Thêm phân loại':'plus','Lưu sản phẩm':'check','Lưu thay đổi':'check','Thêm nhân viên':'plus','Thu hồi quyền':'user-x','Tạo tài khoản':'user-plus','Đổi mật khẩu':'settings'};
  let pendingCount=0,shellMetaLoaded=false,closeSidebar=()=>{};

  const button=(text,attrs='',kind='primary')=>`<button class="ad-btn ad-${kind}" ${attrs}>${actionIcons[text]?icon(actionIcons[text],17):''}<span>${e(text)}</span></button>`;
  const field=(label,name,value='',type='text',extra='')=>`<label>${e(label)}<input name="${e(name)}" type="${type}" value="${e(value)}" ${extra}></label>`;
  const area=(label,name,value='',extra='')=>`<label>${e(label)}<textarea name="${e(name)}" rows="4" ${extra}>${e(value)}</textarea></label>`;
  const option=(value,label,selected)=>`<option value="${e(value)}" ${selected===value?'selected':''}>${e(label)}</option>`;
  const select=(label,name,values,current)=>`<label>${e(label)}<select name="${e(name)}">${Object.entries(values).map(([k,v])=>option(k,v,current)).join('')}</select></label>`;
  const date=value=>new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
  const post=(path,body,method='POST')=>api(path,{method,body:JSON.stringify(body)});
  function login(message=''){
    closeSidebar();root.onkeydown=null;root.className='admin-root';generation++;user=null;settings=null;shellMetaLoaded=false;pendingCount=0;products=[];orders=[];staff=[];document.querySelectorAll('.php-admin-modal').forEach(dialog=>dialog.remove());
    root.innerHTML=`<div class="php-admin-login"><a href="/"><img src="/images/fillico-logo-green.png" alt="Fillico"></a><span class="ad-eyebrow">DÀNH CHO NGƯỜI BÁN</span><h1>Chào mừng trở lại.</h1><form id="login" class="php-admin-form">${field('Email đăng nhập','email','','email','required autocomplete="username"')}${field('Mật khẩu','password','','password','required maxlength="200" autocomplete="current-password"')}<p class="ad-error" role="alert">${e(message)}</p>${button('Đăng nhập','type="submit"')}<a class="text-link" href="/">← Về cửa hàng</a></form></div>`;
    root.querySelector('form').addEventListener('submit',async event=>{
      event.preventDefault();const form=event.currentTarget,submit=form.querySelector('button'),error=form.querySelector('[role=alert]');submit.disabled=true;error.textContent='';
      try{const result=await post('/api/auth/login',{email:form.elements.email.value,password:form.elements.password.value});user=result.user;tab=user.role==='owner'?'dashboard':'orders';location.hash=tab;await render();}catch(err){if(form.isConnected)error.textContent=err.message;else document.querySelector('#login [role=alert]')?.replaceChildren(document.createTextNode(err.message));}finally{submit.disabled=false;}
    });
  }
  window.addEventListener('fillico-session-expired',()=>{if(user)login('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');});
  function updateShell(){
    const store=root.querySelector('[data-store-name]');if(store)store.textContent=settings?.storeName||'FILLICO';
    root.querySelectorAll('[data-pending-count]').forEach(el=>{el.textContent=pendingCount;el.hidden=pendingCount===0;});
    const notification=root.querySelector('[data-notifications]');if(notification){notification.setAttribute('aria-label',pendingCount+' đơn chờ xác nhận');notification.querySelector('i').hidden=pendingCount===0;}
  }
  function shell(){
    closeSidebar();root.className='admin-root ad-layout';
    const owner=user.role==='owner',initial=Array.from(user.name.trim())[0]?.toUpperCase()||'F';
    const title=tab==='dashboard'?'Một ngày tốt lành, '+user.name.trim().split(/\s+/).slice(-1)[0]+'.':names[tab];
    root.innerHTML=`
      <button class="ad-sidebar-backdrop" data-sidebar-backdrop aria-label="Đóng menu" hidden></button>
      <aside class="ad-sidebar" id="admin-sidebar" aria-label="Điều hướng quản trị">
        <a href="/" class="ad-brand" aria-label="Fillico - Trang chủ"><img class="ad-logo-image" src="/images/fillico-logo-green.png" alt="Fillico"><small>SELLER CENTER</small></a>
        <div class="ad-store-chip"><div>${icon('bag')}</div><span><strong data-store-name>${e(settings?.storeName||'FILLICO')}</strong><small>Cửa hàng của bạn</small></span><span class="ad-online"></span></div>
        <span class="ad-nav-group">QUẢN LÝ</span>
        <nav>${navigation.filter(item=>owner||item.id==='orders').map(item=>`<div>${item.group?`<span class="ad-nav-group">${item.group}</span>`:''}<button class="ad-nav-item ${tab===item.id?'active':''}" data-tab="${item.id}" ${tab===item.id?'aria-current="page"':''}>${icon(item.icon)}<span>${e(item.title)}</span>${item.id==='orders'?`<b data-pending-count ${pendingCount?'':'hidden'}>${pendingCount}</b>`:''}</button></div>`).join('')}</nav>
        <div class="ad-sidebar-bottom">
          <a href="/" class="ad-store-link">Xem website bán hàng${icon('arrow-right',16)}</a>
          <button class="ad-store-link ad-password-link" type="button" data-password>Đổi mật khẩu${icon('settings',16)}</button>
          <div class="ad-user"><span class="ad-avatar">${e(initial)}</span><div><strong>${e(user.name)}</strong><small>${owner?'Chủ cửa hàng':'Nhân viên'}</small></div><button class="ad-icon" type="button" data-logout aria-label="Đăng xuất" title="Đăng xuất">${icon('log-out',18)}</button></div>
        </div>
      </aside>
      <div class="ad-workspace">
        <header class="ad-topbar"><div class="ad-breadcrumb"><button class="ad-icon ad-mobile-menu" type="button" data-mobile-menu aria-label="Mở menu" aria-controls="admin-sidebar" aria-expanded="false">${icon('menu',21)}</button><span>Cửa hàng</span>${icon('chevron-right',14)}<strong>${e(names[tab])}</strong></div><div class="ad-topbar-right"><span class="ad-live"><i></i>Đang hoạt động</span><button class="ad-icon ad-notification" type="button" data-notifications aria-label="${pendingCount} đơn chờ xác nhận">${icon('bell')}<i ${pendingCount?'':'hidden'}></i></button><span class="ad-avatar ad-avatar-small">${e(initial)}</span></div></header>
        <main class="ad-main"><div class="ad-page-heading"><div><span class="ad-eyebrow">FILLICO / ${owner?'QUẢN TRỊ CỬA HÀNG':'QUẢN LÝ ĐƠN HÀNG'}</span><h1>${e(title)}</h1><p>${e(descriptions[tab])}</p></div><div id="page-action"></div></div><div id="admin-page"><p role="status">Đang tải…</p></div><footer class="ad-workspace-footer"><span>Fillico Seller Center</span><span>Được chăm chút, từ những điều nhỏ nhất.</span></footer></main>
      </div>`;
    const sidebar=root.querySelector('.ad-sidebar'),backdrop=root.querySelector('[data-sidebar-backdrop]'),menu=root.querySelector('[data-mobile-menu]');let previousFocus=null,previousOverflow='';
    function closeMenu(){sidebar.classList.remove('ad-sidebar-open');backdrop.hidden=true;menu.setAttribute('aria-expanded','false');if(previousFocus){document.body.style.overflow=previousOverflow;previousFocus.focus();previousFocus=null;}}
    closeSidebar=closeMenu;
    root.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>{closeMenu();location.hash=el.dataset.tab;}));
    menu.addEventListener('click',()=>{previousFocus=document.activeElement;previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';sidebar.classList.add('ad-sidebar-open');backdrop.hidden=false;menu.setAttribute('aria-expanded','true');sidebar.querySelector('.ad-nav-item.active')?.focus();});
    backdrop.addEventListener('click',closeMenu);
    root.onkeydown=event=>{
      if(!sidebar.classList.contains('ad-sidebar-open'))return;
      if(event.key==='Escape'){event.preventDefault();closeMenu();}
      if(event.key==='Tab'){const items=[...sidebar.querySelectorAll('a[href],button:not(:disabled)')],first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
    };
    root.querySelector('[data-password]').addEventListener('click',()=>{closeMenu();passwordForm();});
    root.querySelector('[data-logout]').addEventListener('click',async event=>{const control=event.currentTarget;control.disabled=true;try{await api('/api/auth/logout',{method:'POST'});closeMenu();login();}catch(err){toast(err.message);if(user)control.disabled=false;}});
    root.querySelector('[data-notifications]').addEventListener('click',async()=>{closeMenu();if(tab!=='orders'){tab='orders';history.replaceState(null,'','#orders');await render();}const filter=root.querySelector('#order-filter');if(filter){filter.value='pending';filter.dispatchEvent(new Event('change'));}});
    updateShell();
  }
  async function render(){
    if(!user)return;const ownGeneration=++generation;if(user.role!=='owner')tab='orders';shell();
    try{
      let result;
      if(!shellMetaLoaded){const [storeMetadata,orderMetadata]=await Promise.all([api('/api/store'),api('/api/admin/orders')]);if(ownGeneration!==generation)return;settings=storeMetadata.settings;orders=orderMetadata.orders;pendingCount=orders.filter(order=>order.status==='pending').length;shellMetaLoaded=true;updateShell();}
      if(tab==='dashboard'){result=await api('/api/admin/dashboard');if(ownGeneration!==generation)return;pendingCount=result.summary.pendingOrders;updateShell();dashboard(result);}
      else if(tab==='orders'){result=await api('/api/admin/orders');if(ownGeneration!==generation)return;orders=result.orders;pendingCount=orders.filter(order=>order.status==='pending').length;updateShell();if(!settings)settings=(await api('/api/store')).settings;if(ownGeneration!==generation)return;orderList();}
      else if(tab==='products'){result=await api('/api/admin/products');if(ownGeneration!==generation)return;products=result.products;productList();}
      else if(tab==='staff'){result=await api('/api/admin/staff');if(ownGeneration!==generation)return;staff=result.staff;staffList();}
      else {result=await api('/api/admin/settings');if(ownGeneration!==generation)return;settings=result.settings;updateShell();settingsForm();}
    }catch(err){if(ownGeneration===generation&&user){document.querySelector('#admin-page').innerHTML=`<p class="ad-error" role="alert">${e(err.message)}</p>${button('Thử lại','data-retry','outline')}`;document.querySelector('[data-retry]').addEventListener('click',()=>void render());}}
  }
  function dashboard(result){
    const {summary,recentOrders}=result;document.querySelector('#admin-page').innerHTML=`<div class="php-admin-stats">${[['Tổng đơn hàng',summary.totalOrders,'bag'],['Chờ xác nhận',summary.pendingOrders,'clock'],['Doanh thu đã thanh toán',money(summary.revenue),'wallet'],['Sản phẩm sắp hết',summary.lowStockProducts,'package']].map(([label,value,symbol])=>`<div><div class="php-stat-heading"><small>${label}</small><span class="ad-stat-icon">${icon(symbol,20)}</span></div><strong>${value}</strong></div>`).join('')}</div><section class="php-admin-panel"><h2>Đơn hàng gần đây</h2><div id="recent-orders"></div></section>`;orders=recentOrders;orderTable(recentOrders,document.querySelector('#recent-orders'));
  }
  function orderTable(list,container){
    container.innerHTML=`<div class="php-admin-table-wrap"><table class="php-admin-table"><thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Tổng tiền</th><th>Trạng thái</th><th>Thanh toán</th><th></th></tr></thead><tbody>${list.map(o=>`<tr><td><strong>${e(o.code)}</strong><small>${date(o.createdAt)}</small></td><td>${e(o.customer.name)}<small>${e(o.customer.phone)}</small></td><td>${money(o.total)}</td><td><span class="php-admin-status ${e(o.status)}">${e(states[o.status])}</span></td><td>${e(payments[o.paymentStatus])}</td><td>${button('Xem đơn','data-order="'+e(o.id)+'"','outline')}</td></tr>`).join('')||'<tr><td colspan="6">Chưa có đơn hàng.</td></tr>'}</tbody></table></div>`;
    container.querySelectorAll('[data-order]').forEach(el=>el.addEventListener('click',()=>void orderDetail(list.find(o=>o.id===el.dataset.order))));
  }
  function orderList(){
    document.querySelector('#admin-page').innerHTML=`<div class="php-admin-top-search"><input id="order-search" class="php-admin-search" placeholder="Tìm mã đơn, tên, số điện thoại" aria-label="Tìm đơn hàng"><select id="order-filter" aria-label="Lọc trạng thái"><option value="">Tất cả trạng thái</option>${Object.entries(states).map(([k,v])=>option(k,v,'')).join('')}</select></div><div id="order-table"></div>`;
    function filter(){const q=document.querySelector('#order-search').value.trim().toLocaleLowerCase('vi'),status=document.querySelector('#order-filter').value;orderTable(orders.filter(o=>(!status||o.status===status)&&(!q||(o.code+' '+o.customer.name+' '+o.customer.phone).toLocaleLowerCase('vi').includes(q))),document.querySelector('#order-table'));}
    document.querySelector('#order-search').addEventListener('input',filter);document.querySelector('#order-filter').addEventListener('change',filter);filter();
  }
  function modal(title,body){
    document.querySelectorAll('.php-admin-modal').forEach(dialog=>dialog.remove());const dialog=document.createElement('dialog');dialog.className='php-admin-modal admin-root';dialog.setAttribute('aria-label',title);
    dialog.innerHTML=`<div class="php-admin-heading"><h2>${e(title)}</h2><button class="ad-icon" type="button" data-close aria-label="Đóng">${icon('x',21)}</button></div>${body}`;document.body.appendChild(dialog);let dirty=false,locked=false;
    const close=()=>{if(locked)return;if(dirty&&!confirm('Nội dung chưa lưu sẽ bị mất. Bạn muốn đóng?'))return;dialog.close();dialog.remove();};
    dialog.querySelector('[data-close]').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('click',event=>{if(event.target===dialog)close();});dialog.addEventListener('input',()=>{dirty=true;});dialog.showModal();
    return {dialog,close,clean:()=>{dirty=false;},lock:value=>{locked=value;dialog.querySelector('[data-close]').disabled=value;}};
  }
  function bindSubmit(form,handler,context){
    form.addEventListener('submit',async event=>{event.preventDefault();const controls=[...form.querySelectorAll('button')],error=form.querySelector('[role=alert]');error.textContent='';controls.forEach(el=>{el.disabled=true;});context?.lock(true);try{await handler(new FormData(form));}catch(err){if(error.isConnected)error.textContent=err.message;else toast(err.message);}finally{controls.forEach(el=>{el.disabled=false;});context?.lock(false);}});
  }
  async function orderDetail(order){
    if(!settings){try{settings=(await api('/api/store')).settings;}catch(err){toast(err.message);return;}}
    const values=Object.fromEntries([order.status,...transitions[order.status]].map(s=>[s,states[s]]));
    const context=modal('Đơn hàng #'+order.code,`<form class="php-admin-form">${orderHtml(order)}<p>${date(order.createdAt)}</p><div class="php-form-grid">${select('Trạng thái đơn hàng','status',values,order.status)}${select('Trạng thái thanh toán','paymentStatus',payments,order.paymentStatus)}</div><p>Hủy đơn sẽ hoàn tồn kho một lần. Chỉ ghi nhận đã thanh toán hoặc đã hoàn tiền sau khi đối soát thực tế.</p><p class="ad-error" role="alert"></p><div class="php-modal-actions">${button('In / chỉnh sửa phiếu','type="button" data-receipt','outline')}${button('Cập nhật đơn hàng','type="submit"')}</div></form>`);
    context.dialog.querySelector('[data-receipt]').addEventListener('click',()=>{context.close();if(!context.dialog.isConnected)void receiptEditor(order);});
    const form=context.dialog.querySelector('form');
    function paymentChoices(){const status=form.elements.status.value,allowed=Object.entries(payments).filter(([key])=>key===order.paymentStatus||(key==='paid'&&order.paymentStatus==='unpaid'&&status!=='cancelled')||(key==='refunded'&&order.paymentStatus==='paid'&&status==='cancelled'));const current=form.elements.paymentStatus.value;form.elements.paymentStatus.innerHTML=allowed.map(([k,v])=>option(k,v,current)).join('');}
    form.elements.status.addEventListener('change',paymentChoices);paymentChoices();
    bindSubmit(form,async data=>{await post('/api/admin/orders/'+encodeURIComponent(order.id),{status:data.get('status'),paymentStatus:data.get('paymentStatus')},'PATCH');context.clean();context.lock(false);context.close();toast('Đã cập nhật đơn hàng');await render();},context);
  }
  function receiptTemplate(order){
    const header=[settings?.companyName||settings?.storeName||'CỬA HÀNG',settings?.address&&'Địa chỉ: '+settings.address,settings?.phone&&'Điện thoại: '+settings.phone,settings?.email&&'Email: '+settings.email,settings?.taxCode&&'Mã số thuế: '+settings.taxCode].filter(Boolean).join('\n');
    return `${header}\n\nPHIẾU BÁN HÀNG\nMã đơn: ${order.code}\nNgày đặt: ${date(order.createdAt)}\n\nKhách hàng: ${order.customer.name}\nĐiện thoại: ${order.customer.phone}\nĐịa chỉ: ${order.customer.address}${order.customer.email?'\nEmail: '+order.customer.email:''}\n\nSẢN PHẨM\n\n${order.items.map((i,n)=>`${n+1}. ${i.productName} — ${i.variantName}\n   ${i.quantity} × ${money(i.price)} = ${money(i.price*i.quantity)}`).join('\n\n')}\n\nTiền hàng: ${money(order.subtotal)}\nPhí vận chuyển: ${money(order.shippingFee)}\nTỔNG CỘNG: ${money(order.total)}\nThanh toán: ${order.paymentMethod==='bank'?'Chuyển khoản':'Thanh toán khi nhận hàng'}${order.customer.note?'\nGhi chú: '+order.customer.note:''}\n\nCảm ơn quý khách đã mua hàng!`;
  }
  async function receiptEditor(order){
    const path='/api/admin/orders/'+encodeURIComponent(order.id)+'/receipt';let receipt;
    try{receipt=(await api(path)).receipt;}catch(err){toast(err.message);return;}
    const context=modal('Chỉnh sửa và in phiếu · '+order.code,`<form class="php-admin-form"><p>Phiếu bán hàng lưu riêng theo đơn. Sửa phiếu không thay đổi tiền hoặc tồn kho của đơn hàng.</p><label>Nội dung phiếu<textarea name="content" class="receipt-paper" maxlength="30000" required>${e(receipt?.content??receiptTemplate(order))}</textarea></label><p class="php-receipt-help">Bạn có thể sửa, xóa hoặc thêm dòng. Tổng tiền trên phiếu không tự tính lại.</p>${button('Khôi phục mẫu từ đơn hàng','type="button" data-reset','outline')}<p class="ad-error" role="alert"></p><div class="php-modal-actions">${button('Lưu phiếu','type="submit"','outline')}${button('Lưu và in','type="button" data-print')}</div></form>`);
    const form=context.dialog.querySelector('form');let busy=false;
    async function save(){if(!form.elements.content.value.trim())throw new Error('Vui lòng nhập nội dung phiếu.');await post(path,{content:form.elements.content.value},'PUT');context.clean();toast('Đã lưu phiếu');}
    bindSubmit(form,save,context);
    context.dialog.querySelector('[data-reset]').addEventListener('click',()=>{if(confirm('Thay nội dung hiện tại bằng mẫu từ đơn hàng?')){form.elements.content.value=receiptTemplate(order);form.elements.content.dispatchEvent(new Event('input',{bubbles:true}));}});
    context.dialog.querySelector('[data-print]').addEventListener('click',async()=>{
      if(busy)return;const popup=window.open('','_blank');if(!popup){toast('Hãy cho phép cửa sổ bật lên để in phiếu.');return;}busy=true;context.lock(true);form.querySelectorAll('button').forEach(el=>{el.disabled=true;});
      try{await save();const doc=popup.document;doc.title='Phieu-ban-hang-'+order.code;const meta=doc.createElement('meta');meta.charset='utf-8';doc.head.append(meta);const style=doc.createElement('style');style.textContent='@page{size:A4;margin:15mm}body{font:14px/1.55 Arial;color:#111}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;max-width:180mm;margin:auto}';doc.head.append(style);const pre=doc.createElement('pre');pre.textContent=form.elements.content.value;doc.body.replaceChildren(pre);popup.focus();popup.print();}catch(err){popup.close();form.querySelector('[role=alert]').textContent=err.message;}finally{busy=false;context.lock(false);form.querySelectorAll('button').forEach(el=>{el.disabled=false;});}
    });
  }
  function productList(){
    document.querySelector('#page-action').innerHTML=`<div class="product-toolbar-actions">
      ${button('Xuất Excel','data-export-products','outline')}
      ${button('Nhập Excel','data-import-products','outline')}
      ${button('Thêm sản phẩm','data-new-product')}
    </div>`;
    document.querySelector('[data-new-product]').addEventListener('click',()=>productForm());
    document.querySelector('[data-export-products]').addEventListener('click',exportProducts);
    document.querySelector('[data-import-products]').addEventListener('click',importProducts);
    document.querySelector('#admin-page').innerHTML=`<div class="php-admin-top-search">
      <input id="product-search" class="php-admin-search" placeholder="Tìm tên sản phẩm, danh mục, SKU" aria-label="Tìm sản phẩm">
      <select id="product-filter" aria-label="Tình trạng sản phẩm">
        <option value="">Tất cả sản phẩm</option><option value="active">Đang hiển thị</option>
        <option value="hidden">Đang ẩn</option><option value="deleted">Đã xóa</option><option value="low">Sắp hết hàng</option>
      </select></div><div id="product-table"></div>`;
    const search=document.querySelector('#product-search'), status=document.querySelector('#product-filter');
    const container=document.querySelector('#product-table');
    function filter(){
      const query=search.value.trim().toLocaleLowerCase('vi'), filterStatus=status.value;
      const list=products.filter(product=>{
        if(filterStatus==='deleted'?!product.deletedAt:product.deletedAt)return false;
        if(filterStatus==='active'&&!product.active||filterStatus==='hidden'&&product.active)return false;
        if(filterStatus==='low'&&!product.variants.some(variant=>variant.stock<10))return false;
        return !query || [product.name,product.category,...product.variants.map(variant=>variant.sku)].join(' ').toLocaleLowerCase('vi').includes(query);
      });
      const rows=list.map(product=>{
        const id=e(product.id);
        const stock=product.variants.reduce((sum,variant)=>sum+variant.stock,0);
        const label=product.deletedAt?'Đã xóa':product.active?'Đang hiển thị':'Đang ẩn';
        const badge=product.deletedAt?'cancelled':product.active?'delivered':'';
        const actions=product.deletedAt
          ? button('Khôi phục','data-restore="'+id+'"','outline')
          : button('Chỉnh sửa','data-edit="'+id+'"','outline')+button('Xóa','data-delete="'+id+'"','outline');
        return `<tr><td><div class="admin-product-cell"><img src="${e(product.image)}" alt=""><div><strong>${e(product.name)}</strong><small>${product.variants.length} phân loại</small></div></div></td><td>${e(product.category)}</td><td>${money(Math.min(...product.variants.map(variant=>variant.price)))}</td><td>${stock}</td><td><span class="php-admin-status ${badge}">${label}</span></td><td>${actions}</td></tr>`;
      }).join('');
      container.innerHTML=`<div class="php-admin-table-wrap"><table class="php-admin-table"><thead><tr><th>Sản phẩm</th><th>Danh mục</th><th>Giá từ</th><th>Tồn kho</th><th>Tình trạng</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="6">Chưa có sản phẩm phù hợp.</td></tr>'}</tbody></table></div>`;
    }
    container.addEventListener('click',async event=>{
      const control=event.target.closest('[data-edit],[data-delete],[data-restore]');
      if(!control)return;
      const product=products.find(item=>item.id===(control.dataset.edit??control.dataset.delete??control.dataset.restore));
      if(control.dataset.edit){productForm(product);return;}
      const restoring=Boolean(control.dataset.restore);
      const action=restoring?'Khôi phục':'Xóa';
      const consequence=restoring?'Sản phẩm sẽ được khôi phục về Đang ẩn.':'Sản phẩm sẽ được chuyển vào mục Đã xóa.';
      const context=modal(action+' sản phẩm',`<div class="php-admin-form">
        <p><strong>${e(product.name)}</strong></p><p>${consequence}</p>
        <p class="ad-error" role="alert" hidden data-product-action-error></p>
        <div class="php-modal-actions">${button('Hủy','type="button" data-cancel-product-action','outline')}
        ${button(action,'type="button" data-confirm-product-action')}</div></div>`);
      const cancel=context.dialog.querySelector('[data-cancel-product-action]');
      const confirmAction=context.dialog.querySelector('[data-confirm-product-action]');
      cancel.addEventListener('click',context.close);
      cancel.focus();
      confirmAction.addEventListener('click',async()=>{
        context.lock(true);cancel.disabled=true;confirmAction.disabled=true;
        try{
          const path='/api/admin/products/'+encodeURIComponent(product.id);
          const result=restoring?await post(path+'/restore',{}):await api(path,{method:'DELETE'});
          products=products.map(item=>item.id===product.id?result.product:item);
          context.lock(false);context.close();filter();
          toast(restoring?'Đã khôi phục về Đang ẩn':'Đã xóa sản phẩm');
        }catch(err){
          const error=context.dialog.querySelector('[data-product-action-error]');
          error.textContent=err.message;error.hidden=false;
          context.lock(false);cancel.disabled=false;confirmAction.disabled=false;
        }
      });
    });
    search.addEventListener('input',filter);status.addEventListener('change',filter);filter();
  }
  const excelType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  async function exportProducts(event){
    const control=event.currentTarget;
    control.disabled=true;
    try{
      const response=await fetch('/api/admin/products/excel/export',{credentials:'same-origin'});
      if(!response.ok)throw new Error((await response.json()).error||'Không xuất được Excel.');
      const url=URL.createObjectURL(await response.blob());
      const link=document.createElement('a');
      link.href=url;link.download='fillico-san-pham.xlsx';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(err){toast(err.message);}
    finally{control.disabled=false;}
  }
  function importProducts(){
    const context=modal('Nhập Excel',`<div class="php-admin-form product-import-form">
      <p>Chọn tệp .xlsx đã xuất từ cửa hàng. Ô trống giữ nguyên, ảnh sản phẩm được giữ lại.</p>
      <label>Tệp Excel<input type="file" accept=".xlsx,${excelType}" data-excel-file></label>
      <p class="ad-error" role="alert" hidden data-import-error></p>
      <div data-import-result aria-live="polite"></div>
      <div class="php-modal-actions">
        ${button('Nhập Excel','type="button" data-submit-import')}
      </div>
    </div>`);
    const dialog=context.dialog, file=dialog.querySelector('[data-excel-file]');
    const output=dialog.querySelector('[data-import-result]'), error=dialog.querySelector('[data-import-error]');
    const submit=dialog.querySelector('[data-submit-import]');
    function reset(){output.replaceChildren();error.hidden=true;}
    function setBusy(busy){context.lock(busy);file.disabled=busy;submit.disabled=busy;}
    function showError(message){error.textContent=message;error.hidden=false;}
    file.addEventListener('change',()=>{reset();context.clean();});
    submit.addEventListener('click',async()=>{
      reset();
      const selected=file.files[0];
      if(!selected||!/\.xlsx$/i.test(selected.name)){showError('Chọn một tệp .xlsx.');return;}
      if(selected.size>3*1024*1024){showError('Tệp Excel tối đa 3 MB.');return;}
      setBusy(true);
      try{
        const result=await api('/api/admin/products/excel/import',{method:'POST',body:selected,headers:{'Content-Type':excelType}});
        await render();
        file.value='';
        output.innerHTML=`<p>Đã nhập Excel.</p><ul><li>${result.productsUpdated} sản phẩm cập nhật</li><li>${result.variantsUpdated} phân loại cập nhật</li><li>${result.unchangedRows} dòng giữ nguyên</li></ul>`;
      }catch(err){
        showError(err.message);
        if(err.details?.errors?.length) output.innerHTML=`<ul class="product-import-errors">${err.details.errors.map(message=>`<li>${e(message)}</li>`).join('')}</ul>`;
      }
      finally{setBusy(false);}
    });
  }
  function variantRow(v){return `<div class="php-variant" data-variant="${e(v.id)}">${field('Tên phân loại','v-name',v.name,'text','required maxlength="100"')}${field('SKU','v-sku',v.sku,'text','required maxlength="100"')}${field('Giá bán','v-price',v.price,'number','required min="1000" max="100000000" step="1"')}${field('Giá gốc','v-original',v.originalPrice??'','number','min="0" max="100000000" step="1"')}${field('Tồn kho','v-stock',v.stock,'number','required min="0" max="1000000" step="1"')}<button class="ad-icon" type="button" data-remove-variant aria-label="Xóa phân loại">${icon('x',17)}</button></div>`;}
  function productForm(previous){
    const p=previous||{name:'',slug:'',category:'',description:'',image:'',images:[],badge:'',featured:false,active:true,variants:[{id:uuid(),name:'Mặc định',sku:'',price:1000,stock:0}]};
    const context=modal(previous?'Chỉnh sửa sản phẩm':'Thêm sản phẩm',`<form class="php-admin-form"><div class="php-form-grid">${field('Tên sản phẩm','name',p.name,'text','required minlength="2" maxlength="200"')}${field('Đường dẫn (slug)','slug',p.slug,'text','required maxlength="160" pattern="[a-z0-9]+(-[a-z0-9]+)*"')}${field('Danh mục','category',p.category,'text','required maxlength="100"')}${field('Nhãn sản phẩm','badge',p.badge,'text','maxlength="50"')}</div>${area('Mô tả','description',p.description,'maxlength="10000"')}<div class="php-form-grid">${select('Tình trạng','active',{'visible':'Đang hiển thị','hidden':'Đang ẩn'},p.active?'visible':'hidden')}<label class="php-check"><input type="checkbox" name="featured" ${p.featured?'checked':''}> Sản phẩm nổi bật</label></div><div data-product-images></div><h3>Phân loại & tồn kho</h3><div id="variants" class="php-admin-form" style="padding:0">${p.variants.map(variantRow).join('')}</div>${button('Thêm phân loại','type="button" data-add-variant','outline')}<p class="ad-error" role="alert"></p><div class="php-modal-actions">${button('Lưu sản phẩm','type="submit"')}</div></form>`);
    const form=context.dialog.querySelector('form');let uploading=false;
    const media=Fillico.productImages({root:form.querySelector('[data-product-images]'),images:p.images||[],cover:p.image||'',source:p.coverSource||p.image||'',crop:p.coverCrop||null,upload,onBusy:busy=>{uploading=busy;context.lock(busy);form.querySelector('[type=submit]').disabled=busy;}});
    context.dialog.addEventListener('close',()=>media.destroy(),{once:true});
    form.querySelector('[data-add-variant]').addEventListener('click',()=>{const list=form.querySelector('#variants');if(list.children.length>=50){toast('Tối đa 50 phân loại.');return;}list.insertAdjacentHTML('beforeend',variantRow({id:uuid(),name:'',sku:'',price:1000,stock:0}));});
    form.addEventListener('click',event=>{const remove=event.target.closest('[data-remove-variant]');if(remove&&form.querySelectorAll('[data-variant]').length>1)remove.closest('[data-variant]').remove();});
    form.elements.name.addEventListener('input',()=>{if(!previous&&!form.elements.slug.dataset.manual)form.elements.slug.value=form.elements.name.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');});form.elements.slug.addEventListener('input',()=>{form.elements.slug.dataset.manual='1';});
    bindSubmit(form,async data=>{
      if(uploading||media.isBusy())throw new Error('Vui lòng hoàn tất tải hoặc căn chỉnh ảnh.');const body={};for(const key of ['name','slug','category','description','badge'])body[key]=String(data.get(key)||'').trim();body.active=data.get('active')==='visible';body.featured=data.has('featured');const imageData=media.getValue();if(!imageData.image)throw new Error('Vui lòng tải ảnh và chọn một ảnh làm ảnh bìa.');Object.assign(body,imageData);body.variants=[...form.querySelectorAll('[data-variant]')].map(row=>{const value=name=>row.querySelector('[name="v-'+name+'"]').value;const v={id:row.dataset.variant,name:value('name'),sku:value('sku'),price:Number(value('price')),stock:Number(value('stock'))};if(value('original'))v.originalPrice=Number(value('original'));return v;});if(previous)body.revision=previous.revision;
      await post('/api/admin/products'+(previous?'/'+encodeURIComponent(previous.id):''),body,previous?'PUT':'POST');context.clean();context.lock(false);context.close();toast('Đã lưu sản phẩm');await render();
    },context);
  }
  async function upload(file){if(!file)return null;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Chọn ảnh PNG, JPEG hoặc WebP, tối đa 5 MB.');return (await api('/api/admin/uploads',{method:'POST',headers:{'Content-Type':file.type},body:file})).url;}
  function settingsForm(){
    const banner=tab==='banner';
    document.querySelector('#admin-page').innerHTML=`<form class="php-admin-form php-admin-panel" id="settings-form">${banner?`<h2>Banner chính</h2><img src="${e(settings.heroImage)}" class="php-banner-preview" alt="Banner" data-banner-preview><label class="php-check"><input type="checkbox" name="heroEnabled" ${settings.heroEnabled?'checked':''}> Hiển thị banner</label>${field('Tiêu đề banner','heroTitle',settings.heroTitle,'text','required maxlength="200"')}${area('Mô tả banner','heroSubtitle',settings.heroSubtitle,'maxlength="1000"')}${field('Đường dẫn ảnh banner','heroImage',settings.heroImage,'text','required maxlength="2000"')}<label>Tải ảnh banner<input type="file" accept="image/png,image/jpeg,image/webp" data-banner-upload></label>`:`<h2>Thương hiệu & thông tin công ty</h2><div class="php-form-grid">${field('Tên cửa hàng','storeName',settings.storeName,'text','required maxlength="100"')}${field('Tên công ty / hộ kinh doanh','companyName',settings.companyName,'text','maxlength="200"')}${field('Số điện thoại','phone',settings.phone,'tel','maxlength="30"')}${field('Email liên hệ','email',settings.email,'email','maxlength="254"')}${field('Mã số thuế','taxCode',settings.taxCode,'text','maxlength="30"')}${field('Địa chỉ','address',settings.address,'text','maxlength="500"')}</div>${area('Giới thiệu ngắn','tagline',settings.tagline,'maxlength="200"')}<h2>Giao hàng & thanh toán</h2><div class="php-form-grid">${field('Phí giao hàng tiêu chuẩn (đ)','shippingFee',settings.shippingFee,'number','required min="0" max="10000000" step="1"')}${field('Miễn phí giao hàng cho đơn từ (đ)','freeShippingThreshold',settings.freeShippingThreshold,'number','required min="0" max="1000000000" step="1"')}</div><p>Ngưỡng bằng 0: không áp dụng ngưỡng miễn phí. Muốn miễn phí mọi đơn, đặt phí giao hàng bằng 0.</p>${area('Hướng dẫn chuyển khoản','bankInfo',settings.bankInfo,'maxlength="2000"')}<h2>Chính sách cửa hàng</h2>${Object.entries({...Object.fromEntries(Object.keys(policyNames).map(key=>[key,''])),...(settings.policies||{})}).map(([key,value])=>area(policyNames[key]||key,'policy-'+key,value,'maxlength="20000"')).join('')}`}<p class="ad-error" role="alert"></p>${button('Lưu thay đổi','type="submit"')}</form>`;
    const form=document.querySelector('#settings-form');let uploading=false;
    form.querySelector('[data-banner-upload]')?.addEventListener('change',async event=>{uploading=true;form.querySelector('[type=submit]').disabled=true;try{const url=await upload(event.target.files[0]);if(url){form.elements.heroImage.value=url;form.querySelector('[data-banner-preview]').src=url;}}catch(err){form.querySelector('[role=alert]').textContent=err.message;}finally{uploading=false;form.querySelector('[type=submit]').disabled=false;}});
    bindSubmit(form,async data=>{if(uploading)throw new Error('Vui lòng chờ tải ảnh.');const body={};if(banner){for(const key of ['heroTitle','heroSubtitle','heroImage'])body[key]=String(data.get(key)||'');body.heroEnabled=data.has('heroEnabled');}else{for(const key of ['storeName','companyName','phone','email','taxCode','address','tagline','bankInfo'])body[key]=String(data.get(key)||'');for(const key of ['shippingFee','freeShippingThreshold'])body[key]=Number(data.get(key));body.policies={};for(const [key,value] of data)if(key.startsWith('policy-'))body.policies[key.slice(7)]=String(value);}settings=(await post('/api/admin/settings',body,'PUT')).settings;updateShell();toast('Đã lưu thay đổi');});
  }
  function staffList(){
    document.querySelector('#page-action').innerHTML=button('Thêm nhân viên','data-new-staff');document.querySelector('[data-new-staff]').addEventListener('click',staffForm);
    const page=document.querySelector('#admin-page');page.innerHTML=`<div class="php-admin-table-wrap"><table class="php-admin-table"><thead><tr><th>Họ tên</th><th>Email</th><th>Quyền</th><th></th></tr></thead><tbody>${staff.map(u=>`<tr><td>${e(u.name)}</td><td>${e(u.email)}</td><td>${u.role==='owner'?'Chủ cửa hàng':'Nhân viên'}</td><td>${u.role==='staff'?button('Thu hồi quyền','data-revoke="'+e(u.id)+'"','outline'):''}</td></tr>`).join('')}</tbody></table></div>`;
    page.querySelectorAll('[data-revoke]').forEach(el=>el.addEventListener('click',async()=>{const u=staff.find(x=>x.id===el.dataset.revoke);if(!confirm('Thu hồi quyền của '+u.name+'? Tài khoản sẽ bị xóa và đăng xuất khỏi mọi thiết bị.'))return;el.disabled=true;try{await api('/api/admin/staff/'+encodeURIComponent(u.id),{method:'DELETE'});toast('Đã thu hồi quyền');await render();}catch(err){toast(err.message);el.disabled=false;}}));
  }
  function staffForm(){
    const context=modal('Thêm nhân viên',`<form class="php-admin-form">${field('Họ và tên','name','','text','required minlength="2" maxlength="100"')}${field('Email đăng nhập','email','','email','required maxlength="254" autocomplete="off"')}${field('Mật khẩu','password','','password','required minlength="12" maxlength="200" autocomplete="new-password"')}<p>Nhân viên chỉ được xem và xử lý đơn hàng.</p><p class="ad-error" role="alert"></p><div class="php-modal-actions">${button('Tạo tài khoản','type="submit"')}</div></form>`);
    bindSubmit(context.dialog.querySelector('form'),async data=>{await post('/api/admin/staff',{name:data.get('name'),email:data.get('email'),password:data.get('password'),role:'staff'});context.clean();context.lock(false);context.close();toast('Đã tạo nhân viên');await render();},context);
  }
  function passwordForm(){
    const context=modal('Đổi mật khẩu',`<form class="php-admin-form">${field('Mật khẩu hiện tại','currentPassword','','password','required maxlength="200" autocomplete="current-password"')}${field('Mật khẩu mới','password','','password','required minlength="12" maxlength="200" autocomplete="new-password"')}${field('Nhập lại mật khẩu mới','confirmation','','password','required minlength="12" maxlength="200" autocomplete="new-password"')}<p>Sau khi đổi, mọi phiên đăng nhập của tài khoản sẽ kết thúc.</p><p class="ad-error" role="alert"></p><div class="php-modal-actions">${button('Đổi mật khẩu','type="submit"')}</div></form>`);
    bindSubmit(context.dialog.querySelector('form'),async data=>{if(data.get('password')!==data.get('confirmation'))throw new Error('Hai lần nhập mật khẩu mới chưa khớp.');if(data.get('currentPassword')===data.get('password'))throw new Error('Mật khẩu mới cần khác mật khẩu hiện tại.');await post('/api/auth/password',{currentPassword:data.get('currentPassword'),password:data.get('password')});context.clean();context.lock(false);context.close();login('Đã đổi mật khẩu. Vui lòng đăng nhập lại.');},context);
  }
  window.addEventListener('hashchange',()=>{if(!user)return;const next=location.hash.slice(1);tab=Object.hasOwn(names,next)?next:(user.role==='owner'?'dashboard':'orders');void render();});
  (async()=>{try{user=(await api('/api/auth/me')).user;const next=location.hash.slice(1);tab=Object.hasOwn(names,next)?next:(user.role==='owner'?'dashboard':'orders');await render();}catch(err){login(err.status===401?'':err.message);}})();
})();
