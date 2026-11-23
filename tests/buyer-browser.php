<?php
declare(strict_types=1);
use Fillico\ProductWorkbook;

function browserBuyerForm(Browser $browser, string $email, string $password, ?string $name=null): void {
    $browser->wait("document.readyState==='complete' && !!document.querySelector('#buyer-form button:not([disabled])')");
    $values=['email'=>$email,'password'=>$password];
    if ($name!==null) $values['name']=$name;
    $json=json_encode($values,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
    $browser->evaluate("(()=>{const form=document.querySelector('#buyer-form');for(const [key,value] of Object.entries($json))form.elements[key].value=value;form.requestSubmit();})()");
}

function buyerBrowserChecks(Browser $browser,string $base,string $target,PDO $admin): void {
    check('Browser: supplied logo on mobile and guest signup resumes add to cart',function()use($browser,$base,$target){
        $browser->command('Emulation.setDeviceMetricsOverride',['width'=>390,'height'=>844,'deviceScaleFactor'=>1,'mobile'=>true]);
        $browser->go($base.'/san-pham/khan-tam-cotton');
        ensure($browser->evaluate("(()=>{const logo=document.querySelector('.storefront-logo');const r=logo.getBoundingClientRect();return logo.naturalWidth>0&&logo.src.endsWith('/fillico-store-logo.webp')&&logo.alt==='Fillico'&&logo.closest('a').pathname==='/'&&r.right<=innerWidth;})()"));
        ensure($browser->evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
        ensure($browser->evaluate("document.querySelector('.buyer-link').getAttribute('aria-label')==='Đăng nhập tài khoản người mua'"));
        $browser->screenshot($target.'/product-mobile-new-logo.png');
        $browser->evaluate("document.querySelector('#add-product-button').click()");
        $browser->wait("location.pathname==='/dang-nhap'&&!!document.querySelector('#buyer-form')");
        $browser->evaluate("document.querySelector('.buyer-account a[href^=\"/dang-ky\"]').click()");
        $browser->wait("location.pathname==='/dang-ky'&&!!document.querySelector('#buyer-form')");
        browserBuyerForm($browser,'browser-buyer@example.test','BrowserBuyer2026!','Khách trình duyệt');
        $browser->wait("location.pathname==='/san-pham/khan-tam-cotton'&&document.querySelector('[data-cart-count]').textContent==='1'");
        $browser->command('Emulation.setDeviceMetricsOverride',['width'=>1440,'height'=>1000,'deviceScaleFactor'=>1,'mobile'=>false]);
        ensure($browser->evaluate("document.querySelector('[data-buyer-logout]').textContent.trim()==='Đăng xuất'"));
        $browser->screenshot($target.'/product-desktop-new-logo.png');
    });
    check('Browser: same-device accounts and Buy Now preserve the original cart',function()use($browser,$base,$target,$admin){
        $count=(int)$admin->query('SELECT COUNT(*) FROM orders')->fetchColumn();
        $browser->evaluate("document.querySelector('[data-buyer-logout]').click()");
        $browser->wait("location.pathname==='/'&&!!document.querySelector('.buyer-link[href]')");
        $browser->go($base.'/dang-nhap?next=cart');
        browserBuyerForm($browser,'second@example.test','SecondBuyer2026!');
        $browser->wait("location.pathname==='/gio-hang'&&document.querySelector('#cart-content').textContent.includes('Giỏ hàng đang trống')");
        $browser->evaluate("document.querySelector('[data-buyer-logout]').click()");
        $browser->wait("location.pathname==='/'&&!!document.querySelector('.buyer-link[href]')");
        $browser->go($base.'/san-pham/khan-tam-cotton');
        $browser->evaluate("(()=>{const choose=document.querySelector('#variant-choice');choose.value='test-variant-2';choose.dispatchEvent(new Event('change'));document.querySelector('#buy-product-button').click();})()");
        $browser->wait("location.pathname==='/dang-nhap'&&!!document.querySelector('#buyer-form')");
        browserBuyerForm($browser,'browser-buyer@example.test','BrowserBuyer2026!');
        $browser->wait("location.pathname==='/thanh-toan'&&location.search==='?mode=direct'&&document.querySelector('#checkout-lines').textContent.includes('Be')");
        ensure($browser->evaluate("document.querySelectorAll('.checkout-line').length===1&&document.querySelector('[data-cart-count]').textContent==='1'"));
        ensure((int)$admin->query('SELECT COUNT(*) FROM orders')->fetchColumn()===$count,'Buy Now created an order without confirmation');
        $browser->command('Emulation.setDeviceMetricsOverride',['width'=>390,'height'=>844,'deviceScaleFactor'=>1,'mobile'=>true]);
        $browser->evaluate("(()=>{const form=document.querySelector('#checkout-form');form.elements.phone.value='09012';form.elements.address.value='   ';form.requestSubmit();})()");
        ensure($browser->evaluate("document.querySelector('#checkout-phone-error').textContent.includes('10 chữ số')&&document.querySelector('#checkout-address-error').textContent.length>0"));
        ensure($browser->evaluate("document.querySelector('[name=phone]').value==='09012'"));
        ensure($browser->evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
        $browser->screenshot($target.'/checkout-validation-mobile.png');
        $original=$admin->query('SELECT data FROM settings WHERE id=1')->fetchColumn();
        $changed=json_decode($original,true);
        $changed['shippingFee']+=14000;
        $update=$admin->prepare('UPDATE settings SET data=? WHERE id=1');
        $update->execute([json_encode($changed,JSON_THROW_ON_ERROR)]);
        try{
            $browser->evaluate("(()=>{const form=document.querySelector('#checkout-form');form.elements.phone.value='+84 901-234-567';form.elements.address.value='A1';form.querySelector('[type=checkbox]').checked=true;form.requestSubmit();})()");
            $browser->wait("document.querySelector('#checkout-price-change').textContent.includes('Tổng mới')");
            ensure($browser->evaluate("document.querySelector('[name=address]').value==='A1'&&document.querySelector('#checkout-submit').textContent.includes('Xác nhận')"));
            ensure((int)$admin->query('SELECT COUNT(*) FROM orders')->fetchColumn()===$count);
            $browser->screenshot($target.'/checkout-price-change-mobile.png');
            $browser->evaluate("document.querySelector('#checkout-form').requestSubmit()");
            $browser->wait("location.pathname.startsWith('/tai-khoan/don-hang/FL')&&!!document.querySelector('.buyer-order-detail')");
        }finally{$update->execute([$original]);}
        ensure((int)$admin->query('SELECT COUNT(*) FROM orders')->fetchColumn()===$count+1);
        ensure($browser->evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
        $browser->screenshot($target.'/buyer-order-mobile.png');
        $ownOrder=(string)$browser->evaluate('location.pathname');
        $browser->evaluate("document.querySelector('.buyer-menu summary').click()");
        $browser->evaluate("document.querySelector('.buyer-menu-links>a').click()");
        $browser->wait("location.pathname==='/tai-khoan/don-hang'&&!!document.querySelector('.buyer-order-card')&&!!document.querySelector('[data-buyer-logout]:not([disabled])')");
        $browser->evaluate("document.querySelector('[data-buyer-logout]').click()");
        $browser->wait("location.pathname==='/'&&!!document.querySelector('.buyer-link[href]')");
        $browser->go($base.'/dang-nhap?next=orders');
        browserBuyerForm($browser,'second@example.test','SecondBuyer2026!');
        $browser->wait("location.pathname==='/tai-khoan/don-hang'");
        $browser->go($base.$ownOrder);
        ensure($browser->evaluate("!document.querySelector('.buyer-order-detail') && !document.body.textContent.includes('browser-buyer@example.test')"));
        $browser->evaluate("document.querySelector('[data-buyer-logout]').click()");
        $browser->wait("location.pathname==='/'&&!!document.querySelector('.buyer-link[href]')");
        $browser->go($base.'/dang-nhap?next=cart');
        browserBuyerForm($browser,'browser-buyer@example.test','BrowserBuyer2026!');
        $browser->wait("location.pathname==='/gio-hang'&&!!document.querySelector('[data-cart-quantity]')");
        $browser->go($base.'/gio-hang');
        ensure($browser->evaluate("document.querySelector('[data-cart-quantity=\"0\"]').value==='1'"));
        $browser->command('Emulation.setDeviceMetricsOverride',['width'=>1440,'height'=>1000,'deviceScaleFactor'=>1,'mobile'=>false]);
    });
    check('Browser: cart names stock problems and offers reduction or removal',function()use($browser,$base,$admin,$target){
        $browser->go($base.'/san-pham/khan-tam-cotton');
        $browser->evaluate("(()=>{const variant=document.querySelector('#variant-choice');variant.value='test-variant-2';variant.dispatchEvent(new Event('change'));document.querySelector('[name=quantity]').value=2;document.querySelector('#add-product-button').click();})()");
        $browser->wait("document.querySelector('[data-cart-count]').textContent==='3'");
        $fetch=$admin->prepare('SELECT data FROM variants WHERE id=?');
        $update=$admin->prepare('UPDATE variants SET data=? WHERE id=?');
        $original=[];
        try{
            foreach(['0'=>0,'test-variant-2'=>1] as $id=>$stock){
                $fetch->execute([(string)$id]);
                $original[$id]=$fetch->fetchColumn();
                $variant=json_decode($original[$id],true);
                $variant['stock']=$stock;
                $update->execute([json_encode($variant,JSON_THROW_ON_ERROR),(string)$id]);
            }
            $browser->command('Emulation.setDeviceMetricsOverride',['width'=>390,'height'=>844,'deviceScaleFactor'=>1,'mobile'=>true]);
            $browser->go($base.'/gio-hang');
            ensure($browser->evaluate("document.querySelector('[data-cart-line=\"0\"]').textContent.includes('Hết hàng')&&document.querySelector('[data-reduce]').textContent.includes('1')&&!!document.querySelector('.php-cart-summary button:disabled')"));
            ensure($browser->evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
            $browser->screenshot($target.'/cart-stock-mobile.png');
            $browser->evaluate("document.querySelector('[data-reduce]').click()");
            $browser->wait("document.querySelector('[data-cart-quantity=\"test-variant-2\"]').value==='1'&&!document.querySelector('[data-reduce]')");
            $browser->evaluate("document.querySelector('[data-remove=\"test-variant-2\"]').click()");
            $browser->wait("!document.querySelector('[data-cart-line=\"test-variant-2\"]')");
        }finally{
            foreach($original as $id=>$data)$update->execute([$data,(string)$id]);
            $browser->command('Emulation.setDeviceMetricsOverride',['width'=>1440,'height'=>1000,'deviceScaleFactor'=>1,'mobile'=>false]);
        }
        $browser->go($base.'/gio-hang');
        ensure($browser->evaluate("!!document.querySelector('.php-cart-summary a[href=\"/thanh-toan\"]')"));
    });
}

function sellerBrowserChecks(Browser $browser,string $base,string $target,PDO $admin): void {
    check('Browser: seller imports Excel in one action and restores a deleted product as hidden',function()use($browser,$base,$target,$admin){
        $browser->go($base.'/admin#products');
        $browser->wait("!!document.querySelector('[data-import-products]')&&document.querySelector('#product-table')?.textContent.includes('Sản phẩm PHP mới')");
        $file=$target.'/browser-product-edit.xlsx';
        $product=json_decode($admin->query("SELECT data FROM products WHERE slug='san-pham-php-moi'")->fetchColumn(),true);
        file_put_contents($file, ProductWorkbook::write(['Sản phẩm'=>[[$product['id'],$product['revision'],$product['name'],'Nhập Excel','','Đang hiển thị']],'Phân loại'=>[]]));
        $browser->evaluate("document.querySelector('[data-import-products]').click()");
        $doc=$browser->command('DOM.getDocument');
        $input=$browser->command('DOM.querySelector',['nodeId'=>$doc['root']['nodeId'],'selector'=>'[data-excel-file]']);
        $browser->command('DOM.setFileInputFiles',['nodeId'=>$input['nodeId'],'files'=>[str_replace('\\','/',$file)]]);
        ensure(!str_contains($admin->query("SELECT data FROM products WHERE slug='san-pham-php-moi'")->fetchColumn(),'Nhập Excel'));
        $browser->command('Emulation.setDeviceMetricsOverride',['width'=>390,'height'=>844,'deviceScaleFactor'=>1,'mobile'=>true]);
        ensure($browser->evaluate("(()=>{const dialog=document.querySelector('dialog'),apply=document.querySelector('[data-submit-import]');return dialog.scrollWidth<=dialog.clientWidth+1&&apply.getBoundingClientRect().right<=dialog.getBoundingClientRect().right&&document.documentElement.scrollWidth<=innerWidth+1;})()"));
        $browser->evaluate("document.querySelector('[data-submit-import]').click()");
        $browser->wait("document.querySelector('[data-import-result]')?.textContent.includes('1 sản phẩm cập nhật')&&document.querySelector('#product-table')?.textContent.includes('Nhập Excel')");
        $browser->screenshot($target.'/product-excel-import-mobile.png');
        $browser->evaluate("document.querySelector('dialog [data-close]').click()");
        $browser->command('Emulation.setDeviceMetricsOverride',['width'=>1440,'height'=>1000,'deviceScaleFactor'=>1,'mobile'=>false]);
        $id=json_encode($product['id'],JSON_THROW_ON_ERROR);
        $browser->evaluate("Array.from(document.querySelectorAll('[data-delete]')).find(button=>button.dataset.delete===$id).click()");
        $browser->wait("!!document.querySelector('[data-confirm-product-action]')");
        ensure($browser->evaluate("document.querySelector('dialog').textContent.includes('Sản phẩm PHP mới')"));
        $browser->evaluate("document.querySelector('[data-cancel-product-action]').click()");
        ensure($browser->evaluate("document.querySelector('#product-table').textContent.includes('Sản phẩm PHP mới')"));
        $browser->evaluate("Array.from(document.querySelectorAll('[data-delete]')).find(button=>button.dataset.delete===$id).click();document.querySelector('[data-confirm-product-action]').click()");
        $browser->wait("!document.querySelector('#product-table').textContent.includes('Sản phẩm PHP mới')");
        $browser->evaluate("(()=>{const filter=document.querySelector('#product-filter');filter.value='deleted';filter.dispatchEvent(new Event('change'));})()");
        $browser->wait("!!document.querySelector('[data-restore]')");
        $browser->evaluate("document.querySelector('[data-restore]').click();document.querySelector('[data-confirm-product-action]').click()");
        $browser->wait("!document.querySelector('[data-restore]')");
        $browser->evaluate("(()=>{const filter=document.querySelector('#product-filter');filter.value='hidden';filter.dispatchEvent(new Event('change'));})()");
        ensure($browser->evaluate("document.querySelector('#product-table').textContent.includes('Sản phẩm PHP mới')&&document.querySelector('#product-table').textContent.includes('Đang ẩn')"));
    });
}
