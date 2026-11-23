<?php
declare(strict_types=1);
// Browser/file/database assertions for the image gallery and non-destructive cover crop.
function productImageChecks(Browser $browser,string $base,string $target,PDO $admin):void{
    $wide=imagecreatetruecolor(1800,1200);$red=imagecolorallocate($wide,220,45,40);$green=imagecolorallocate($wide,35,185,80);$blue=imagecolorallocate($wide,35,80,220);
    imagefilledrectangle($wide,0,0,599,1199,$red);imagefilledrectangle($wide,600,0,1199,1199,$green);imagefilledrectangle($wide,1200,0,1799,1199,$blue);imagepng($wide,$target.'/public_html/test-wide.png');imagedestroy($wide);
    $portrait=imagecreatetruecolor(1000,1600);$background=imagecolorallocate($portrait,245,236,212);imagefill($portrait,0,0,$background);$ink=imagecolorallocate($portrait,45,110,70);imagefilledellipse($portrait,500,800,650,1000,$ink);imagepng($portrait,$target.'/public_html/test-portrait.png');imagedestroy($portrait);
    $sourceUrls=[];$croppedUrl='';$expectedPixel=[];
    $openEditor=static function()use($browser){$browser->evaluate("document.querySelector('[data-tab=products]').click()");$browser->wait("!!document.querySelector('#product-table')");$browser->evaluate("Array.from(document.querySelectorAll('[data-edit]')).find(el=>el.closest('tr').textContent.includes('Sản phẩm PHP mới')).click()");$browser->wait("!!document.querySelector('[data-product-images]')");};
    check('Browser: multi-upload, choose cover and crop without altering originals',function()use($browser,$base,$target,$admin,$openEditor,&$sourceUrls,&$croppedUrl,&$expectedPixel){
        $openEditor();$document=$browser->command('DOM.getDocument');$input=$browser->command('DOM.querySelector',['nodeId'=>$document['root']['nodeId'],'selector'=>'.php-admin-modal [data-upload="image"]']);
        $browser->command('DOM.setFileInputFiles',['nodeId'=>$input['nodeId'],'files'=>[str_replace('\\','/',$target.'/public_html/test-wide.png'),str_replace('\\','/',$target.'/public_html/test-portrait.png')]]);
        $browser->wait("document.querySelectorAll('[data-photo-index]').length === 3 && !document.querySelector('dialog form [type=submit]').disabled");
        $sourceUrls=$browser->evaluate("Array.from(document.querySelectorAll('[data-photo-index] .product-photo-picture>img')).map(el=>new URL(el.src).pathname)");
        $browser->evaluate("document.querySelector('[data-use-cover=\"1\"]').click()");ensure($browser->evaluate("document.querySelector('dialog [name=image]').value")===$sourceUrls[1]);
        $browser->evaluate("document.querySelector('[data-crop-current]').click()");$browser->wait("!!document.querySelector('.product-crop-dialog [data-crop-apply]:not(:disabled)')");
        $browser->evaluate("(()=>{const z=document.querySelector('[data-crop-zoom]');z.value=1.5;z.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-crop-rotate]').click();})()");
        $rect=$browser->evaluate("(()=>{const r=document.querySelector('[data-crop-canvas]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
        $browser->command('Input.dispatchMouseEvent',['type'=>'mousePressed','x'=>$rect['x'],'y'=>$rect['y'],'button'=>'left','buttons'=>1,'clickCount'=>1]);
        $browser->command('Input.dispatchMouseEvent',['type'=>'mouseMoved','x'=>$rect['x']+55,'y'=>$rect['y']-65,'button'=>'left','buttons'=>1]);
        $browser->command('Input.dispatchMouseEvent',['type'=>'mouseReleased','x'=>$rect['x']+55,'y'=>$rect['y']-65,'button'=>'left','buttons'=>0,'clickCount'=>1]);
        $expectedPixel=$browser->evaluate("Array.from(document.querySelector('[data-crop-canvas]').getContext('2d').getImageData(400,400,1,1).data)");$browser->screenshot($target.'/product-cover-crop.png');
        $browser->evaluate("document.querySelector('[data-crop-apply]').click()");$browser->wait("!document.querySelector('.product-crop-dialog') && document.querySelector('dialog [name=image]').value !== ".json_encode($sourceUrls[1]));
        $croppedUrl=$browser->evaluate("document.querySelector('dialog [name=image]').value");ensure(str_starts_with($croppedUrl,'/uploads/'));ensure(!in_array($croppedUrl,$sourceUrls,true));
        $browser->screenshot($target.'/product-image-gallery.png');$browser->evaluate("document.querySelector('dialog form').requestSubmit()");$browser->wait("!document.querySelector('dialog')");
        $p=json_decode($admin->query("SELECT data FROM products WHERE slug='san-pham-php-moi'")->fetchColumn(),true);
        ensure($p['image']===$croppedUrl);ensure($p['coverSource']===$sourceUrls[1]);ensure($p['images']===$sourceUrls);ensure($p['coverCrop']['zoom']===1.5);ensure($p['coverCrop']['rotation']===90);ensure(abs($p['coverCrop']['offsetX'])>.01||abs($p['coverCrop']['offsetY'])>.01);
        $file=$target.'/fillico-private/uploads/'.basename($croppedUrl);$size=getimagesize($file);ensure($size[0]===800&&$size[1]===800,'Crop must use native square pixels without upscaling');
        $image=imagecreatefromstring(file_get_contents($file));$color=imagecolorsforindex($image,imagecolorat($image,400,400));imagedestroy($image);
        foreach(['red','green','blue'] as $i=>$channel)ensure(abs($color[$channel]-$expectedPixel[$i])<35,'Saved crop differs from canvas preview');
        ensure(hash_file('sha256',$target.'/public_html/test-wide.png')===hash_file('sha256',$target.'/fillico-private/uploads/'.basename($sourceUrls[1])),'Original upload bytes changed');
        $browser->go($base.'/san-pham/san-pham-php-moi');ensure($browser->evaluate("new URL(document.querySelector('#detail-image').src).pathname")===$croppedUrl);ensure($browser->evaluate("document.querySelectorAll('[data-gallery]').length")===3,'Cover source must not duplicate the cropped cover in storefront gallery');
        $browser->go($base.'/admin#products');$browser->wait("!!document.querySelector('#product-table')");
    });
    check('Browser: twelve-photo storefront gallery stays within mobile viewport',function()use($browser,$base,$admin){
        $row=$admin->query("SELECT id,data FROM products WHERE slug='media-api-test'")->fetch(PDO::FETCH_ASSOC);$p=json_decode($row['data'],true);
        $p['images']=array_map(fn($name)=>'/images/product-'.$name.'.svg',['toothbrush','towel','bodywash','dispenser','slippers','floor','amenities','towel-small','tray','bottle','robe','laundry']);$p['image']='/images/product-towel.svg';$p['coverSource']=$p['image'];$p['coverCrop']=null;
        $admin->prepare('UPDATE products SET data=? WHERE id=?')->execute([json_encode($p,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$row['id']]);
        $browser->command('Emulation.setDeviceMetricsOverride',['width'=>390,'height'=>844,'deviceScaleFactor'=>1,'mobile'=>true]);$browser->go($base.'/san-pham/media-api-test');
        ensure($browser->evaluate("document.querySelectorAll('[data-gallery]').length")===12);ensure($browser->evaluate("document.documentElement.scrollWidth <= innerWidth+1"),'Many thumbnails overflow the page');
        $browser->command('Emulation.setDeviceMetricsOverride',['width'=>1440,'height'=>1000,'deviceScaleFactor'=>1,'mobile'=>false]);$browser->go($base.'/admin#products');$browser->wait("!!document.querySelector('#product-table')");
    });
    check('Browser: reopen crop, cancel safely, change cover and enforce photo limit',function()use($browser,$base,$target,$admin,$openEditor,$sourceUrls,$croppedUrl){
        $openEditor();ensure($browser->evaluate("document.querySelector('dialog [name=image]').value")===$croppedUrl);$browser->evaluate("document.querySelector('[data-use-cover=\"1\"]').click()");ensure($browser->evaluate("document.querySelector('dialog [name=image]').value")===$croppedUrl,'Selecting the active cover discarded its crop');ensure($browser->evaluate("document.querySelectorAll('[data-photo-index]').length")===3);
        $browser->evaluate("document.querySelector('[data-crop-current]').click()");$browser->wait("!!document.querySelector('[data-crop-apply]:not(:disabled)')");ensure(abs((float)$browser->evaluate("document.querySelector('[data-crop-zoom]').value")-1.5)<.001,'Saved framing was lost');
        $browser->command('Emulation.setDeviceMetricsOverride',['width'=>390,'height'=>844,'deviceScaleFactor'=>1,'mobile'=>true]);
        ensure($browser->evaluate("document.querySelector('.product-crop-dialog').scrollWidth <= document.querySelector('.product-crop-dialog').clientWidth+1"),'Crop dialog overflows on mobile');$browser->screenshot($target.'/product-crop-mobile.png');
        $browser->evaluate("document.querySelector('[data-crop-reset]').click();document.querySelector('[data-crop-cancel]').click()");$browser->wait("!document.querySelector('.product-crop-dialog')");ensure($browser->evaluate("document.querySelector('dialog [name=image]').value")===$croppedUrl,'Cancel changed the cover');
        $browser->command('Emulation.setDeviceMetricsOverride',['width'=>1440,'height'=>1000,'deviceScaleFactor'=>1,'mobile'=>false]);
        $document=$browser->command('DOM.getDocument');$input=$browser->command('DOM.querySelector',['nodeId'=>$document['root']['nodeId'],'selector'=>'dialog [data-upload="image"]']);
        $browser->command('DOM.setFileInputFiles',['nodeId'=>$input['nodeId'],'files'=>array_fill(0,10,str_replace('\\','/',$target.'/public_html/test-wide.png'))]);
        $browser->wait("document.querySelector('.product-media-errors').textContent.includes('Tối đa')");ensure($browser->evaluate("document.querySelectorAll('[data-photo-index]').length")===3,'Over-limit selection changed gallery');
        $browser->evaluate("document.querySelector('[data-use-cover=\"2\"]').click();document.querySelector('dialog form').requestSubmit()");$browser->wait("!document.querySelector('dialog')");
        $p=json_decode($admin->query("SELECT data FROM products WHERE slug='san-pham-php-moi'")->fetchColumn(),true);ensure($p['image']===$sourceUrls[2]);ensure($p['coverSource']===$sourceUrls[2]);ensure($p['coverCrop']===null);ensure(count($p['images'])===3);
    });
}
