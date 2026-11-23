<?php
declare(strict_types=1);
// Minimal Chrome DevTools client in PHP. No npm/WebDriver/browser libraries.
final class Browser {
    private mixed $process;private mixed $socket;private int $id=0;private array $events=[];private string $trace;
    public function __construct(string $profile,string $log){
        $this->trace=$log.'.cdp';file_put_contents($this->trace,"Starting Chrome\n");$binary=getenv('FILLICO_CHROME')?:'';
        if($binary==='')foreach(['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'] as $candidate)if(is_file($candidate)){$binary=$candidate;break;}
        if(!is_file($binary))throw new RuntimeException('Set FILLICO_CHROME to a Chrome/Chromium executable.');
        $this->process=proc_open([$binary,'--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='.$profile,'about:blank'],[0=>['pipe','r'],1=>['file',$log,'a'],2=>['file',$log,'a']],$pipes,null,null,['bypass_shell'=>true]);fclose($pipes[0]);
        for($i=0;$i<100&&!is_file($profile.'/DevToolsActivePort');$i++)usleep(100000);
        if(!is_file($profile.'/DevToolsActivePort'))throw new RuntimeException('Chrome did not start. See '.$log);
        $port=(int)file($profile.'/DevToolsActivePort')[0];file_put_contents($this->trace,"Fetching targets\n",FILE_APPEND);
        $targetSocket=fsockopen('127.0.0.1',$port,$errno,$error,5);stream_set_timeout($targetSocket,5);
        fwrite($targetSocket,"GET /json/list HTTP/1.1\r\nHost: 127.0.0.1:$port\r\nConnection: close\r\n\r\n");
        $length=null;while(($line=fgets($targetSocket))!==false&&$line!=="\r\n")if(preg_match('/^Content-Length: ([0-9]+)/i',$line,$m))$length=(int)$m[1];
        $body='';if($length!==null){while(strlen($body)<$length){$chunk=fread($targetSocket,$length-strlen($body));if($chunk===false||$chunk==='')throw new RuntimeException('Chrome target listing incomplete');$body.=$chunk;}}else{$body=stream_get_contents($targetSocket);}fclose($targetSocket);
        $pages=json_decode($body,true,512,JSON_THROW_ON_ERROR);$pages=array_values(array_filter($pages,fn($page)=>$page['type']==='page'));$url=parse_url($pages[0]['webSocketDebuggerUrl']);
        $this->socket=fsockopen('127.0.0.1',$port,$errno,$error,10);stream_set_timeout($this->socket,15);
        $key=base64_encode(random_bytes(16));fwrite($this->socket,"GET ".$url['path']." HTTP/1.1\r\nHost: 127.0.0.1:$port\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: $key\r\nSec-WebSocket-Version: 13\r\n\r\n");
        $headers='';while(!str_ends_with($headers,"\r\n\r\n")){$chunk=fread($this->socket,1);if($chunk==='')throw new RuntimeException('WebSocket handshake failed');$headers.=$chunk;}
        if(!preg_match('~^HTTP/1\.1 101\b~',$headers))throw new RuntimeException('Chrome WebSocket rejected handshake: '.strtok($headers,"\r\n"));
        $this->command('Page.enable');$this->command('Runtime.enable');
    }
    private function send(string $payload,int $opcode=1):void{
        $length=strlen($payload);$mask=random_bytes(4);$header=chr(0x80|$opcode).($length<126?chr(0x80|$length):($length<65536?chr(0xfe).pack('n',$length):chr(0xff).pack('NN',0,$length)));
        $masked='';for($i=0;$i<$length;$i++)$masked.=$payload[$i]^$mask[$i%4];$bytes=$header.$mask.$masked;while($bytes!==''){$sent=fwrite($this->socket,$bytes);if(!$sent)throw new RuntimeException('WebSocket write failed');$bytes=substr($bytes,$sent);}
    }
    private function bytes(int $count):string{$out='';while(strlen($out)<$count){$chunk=fread($this->socket,$count-strlen($out));if($chunk===false||$chunk==='')throw new RuntimeException('Chrome connection timed out/closed');$out.=$chunk;}return $out;}
    private function receive():array{
        while(true){$head=$this->bytes(2);$opcode=ord($head[0])&15;$length=ord($head[1])&127;if($length===126)$length=unpack('n',$this->bytes(2))[1];elseif($length===127){$parts=unpack('Nhigh/Nlow',$this->bytes(8));if($parts['high'])throw new RuntimeException('Frame too large');$length=$parts['low'];}$mask=(ord($head[1])&128)?$this->bytes(4):null;$payload=$this->bytes($length);if($mask)for($i=0;$i<$length;$i++)$payload[$i]=$payload[$i]^$mask[$i%4];if($opcode===9){$this->send($payload,10);continue;}if($opcode===8)throw new RuntimeException('Chrome closed connection');if($opcode!==1)continue;return json_decode($payload,true,512,JSON_THROW_ON_ERROR);}
    }
    public function command(string $method,array $params=[]):array{
        $id=++$this->id;file_put_contents($this->trace,"$id $method\n",FILE_APPEND);$this->send(json_encode(['id'=>$id,'method'=>$method,'params'=>(object)$params],JSON_THROW_ON_ERROR));
        while(true){$message=$this->receive();if(($message['id']??null)===$id){if(isset($message['error']))throw new RuntimeException(json_encode($message['error']));return $message['result']??[];}if(isset($message['method']))$this->events[]=$message;}
    }
    public function event(string $method):array{while(true){foreach($this->events as $index=>$event)if($event['method']===$method){array_splice($this->events,$index,1);return $event['params'];}$message=$this->receive();if(isset($message['method']))$this->events[]=$message;}}
    public function evaluate(string $expression):mixed{
        $result=$this->command('Runtime.evaluate',['expression'=>$expression,'awaitPromise'=>true,'returnByValue'=>true,'userGesture'=>true]);
        if(isset($result['exceptionDetails']))throw new RuntimeException($result['exceptionDetails']['exception']['description']??$result['exceptionDetails']['text']);return $result['result']['value']??null;
    }
    public function wait(string $expression):void{for($i=0;$i<100;$i++){try{if($this->evaluate($expression))return;}catch(Throwable $err){if(str_contains($err->getMessage(),'timed out/closed'))throw $err;}usleep(100000);}throw new RuntimeException('Browser wait failed: '.$expression);}
    public function go(string $url,string $ready="document.readyState==='complete' && !!window.Fillico"):void{$this->command('Page.navigate',['url'=>$url]);$this->wait('location.href === '.json_encode($url).' && ('.$ready.')');}
    public function screenshot(string $path):void{$r=$this->command('Page.captureScreenshot',['format'=>'png','captureBeyondViewport'=>false]);file_put_contents($path,base64_decode($r['data']));}
    public function close():void{try{$this->command('Browser.close');}catch(Throwable){}if(is_resource($this->socket))fclose($this->socket);if(is_resource($this->process)){proc_terminate($this->process);proc_close($this->process);}}
}

function browserChecks(string $base,string $target,PDO $admin):void{
    require_once __DIR__.'/buyer-browser.php';
    $browser=new Browser($target.'/chrome-profile',$target.'/chrome.log');
    try{
        check('Browser: PHP storefront, favorites and mobile width',function()use($browser,$base,$target){
            $browser->go($base.'/');$browser->wait("!!document.querySelector('[data-favorite]')");$browser->evaluate("document.querySelector('[data-favorite]').click()");$browser->go($base.'/san-pham?filter=favorites');$browser->wait("document.querySelectorAll('[data-favorites-only] [data-product-id]:not([hidden])').length === 1");
            $browser->command('Emulation.setDeviceMetricsOverride',['width'=>390,'height'=>844,'deviceScaleFactor'=>1,'mobile'=>true]);ensure($browser->evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'),'Mobile overflow');$browser->screenshot($target.'/mobile-catalog.png');$browser->command('Emulation.setDeviceMetricsOverride',['width'=>1440,'height'=>1000,'deviceScaleFactor'=>1,'mobile'=>false]);
        });
        buyerBrowserChecks($browser,$base,$target,$admin);
        check('Browser: variant, cart persistence and checkout replay after response loss',function()use($browser,$base,$admin){
            $browser->go($base.'/san-pham/khan-tam-cotton');$browser->wait("!!document.querySelector('#variant-stock').textContent");$browser->evaluate("document.querySelector('#add-product-button').click()");$browser->wait("document.querySelector('[data-cart-count]').textContent === '2'");$browser->go($base.'/gio-hang');$browser->wait("!!document.querySelector('[data-cart-quantity]')");$browser->evaluate("(()=>{const x=document.querySelector('[data-cart-quantity]');x.value=2;x.dispatchEvent(new Event('change',{bubbles:true}));})()");$browser->wait("document.querySelector('[data-cart-quantity]').value === '2' && !document.querySelector('[data-cart-quantity]').disabled");$browser->go($base.'/gio-hang');$browser->wait("document.querySelector('[data-cart-quantity]').value === '2'");$browser->go($base.'/thanh-toan');
            $browser->command('Fetch.enable',['patterns'=>[['urlPattern'=>$base.'/api/orders','requestStage'=>'Response']]]);
            $browser->evaluate("(()=>{const f=document.querySelector('#checkout-form');Object.entries({name:'Khách trình duyệt',phone:'0901234567',email:'browser@example.test',address:'123 Nguyễn Trãi, Thành phố Hồ Chí Minh',note:''}).forEach(([k,v])=>f.elements[k].value=v);f.querySelector('[type=checkbox]').checked=true;f.requestSubmit();})()");
            $paused=$browser->event('Fetch.requestPaused');ensure(($paused['responseStatusCode']??0)===201,'Order must commit before dropping response');$key=$browser->evaluate("JSON.parse(sessionStorage.getItem('fillico-pending-checkout-v2:'+JSON.parse(document.querySelector('#store-data').textContent).customer.id)).key");$browser->command('Fetch.failRequest',['requestId'=>$paused['requestId'],'errorReason'=>'Aborted']);$browser->command('Fetch.disable');$browser->wait("!document.querySelector('#checkout-submit').disabled");$count=(int)$admin->query('SELECT COUNT(*) FROM orders')->fetchColumn();$browser->go($base.'/thanh-toan');
            ensure($browser->evaluate("document.querySelector('[name=name]').readOnly"),'Pending fields must be locked');ensure($browser->evaluate("JSON.parse(sessionStorage.getItem('fillico-pending-checkout-v2:'+JSON.parse(document.querySelector('#store-data').textContent).customer.id)).key") === $key);$browser->evaluate("(()=>{const f=document.querySelector('#checkout-form');f.querySelector('[type=checkbox]').checked=true;f.requestSubmit();})()");$browser->wait("location.pathname.startsWith('/tai-khoan/don-hang/FL') && !!document.querySelector('.buyer-order-detail')");ensure((int)$admin->query('SELECT COUNT(*) FROM orders')->fetchColumn()===$count,'Replay created duplicate order');ensure($browser->evaluate("sessionStorage.getItem('fillico-pending-checkout-v2:'+JSON.parse(document.querySelector('#store-data').textContent).customer.id) === null"));
        });
        check('Browser: expired checkout purges customer and requires confirmation',function()use($browser,$base){
            $browser->evaluate("sessionStorage.setItem('fillico-pending-checkout-v2:'+JSON.parse(document.querySelector('#store-data').textContent).customer.id,JSON.stringify({key:'expired-checkout-1',createdAt:Date.now()-1900000,body:{customer:{name:'Private customer'},items:[]}}))");$browser->go($base.'/san-pham');$browser->wait("JSON.parse(sessionStorage.getItem('fillico-pending-checkout-v2:'+JSON.parse(document.querySelector('#store-data').textContent).customer.id)).body === null");$browser->go($base.'/thanh-toan');$browser->wait("!!document.querySelector('#new-checkout')");ensure($browser->evaluate("JSON.parse(sessionStorage.getItem('fillico-pending-checkout-v2:'+JSON.parse(document.querySelector('#store-data').textContent).customer.id)).body === null"));ensure($browser->evaluate("document.querySelector('#checkout-submit').disabled"));$browser->evaluate("sessionStorage.removeItem('fillico-pending-checkout-v2:'+JSON.parse(document.querySelector('#store-data').textContent).customer.id)");
        });
        check('Browser: admin login, edit product and save receipt',function()use($browser,$base,$target){
            $browser->go($base.'/admin');$browser->wait("!!document.querySelector('#login')");$browser->evaluate("(()=>{const f=document.querySelector('#login');f.elements.email.value='owner@example.test';f.elements.password.value='ChangedOwner2026!';f.requestSubmit();})()");$browser->wait("!!document.querySelector('[data-tab=products]')");
            ensure($browser->evaluate("document.querySelectorAll('.ad-sidebar [data-tab] svg[data-icon]').length === 6"),'Sidebar SVG icons missing');
            ensure($browser->evaluate("document.querySelector('.ad-brand small').textContent === 'SELLER CENTER'"),'Original sidebar branding missing');
            ensure($browser->evaluate("document.querySelector('[data-tab=products]').textContent.includes('Sản phẩm & kho')"),'Original navigation labels missing');
            $browser->evaluate("document.fonts.ready.then(()=>true)");
            $browser->screenshot($target.'/admin-restored-desktop.png');
            $clip=$browser->command('Page.captureScreenshot',['format'=>'png','clip'=>['x'=>0,'y'=>0,'width'=>248,'height'=>1000,'scale'=>1]]);file_put_contents($target.'/admin-sidebar.png',base64_decode($clip['data']));
            $browser->command('Emulation.setDeviceMetricsOverride',['width'=>390,'height'=>844,'deviceScaleFactor'=>1,'mobile'=>true]);
            $browser->evaluate("document.querySelector('[data-mobile-menu]').click()");$browser->wait("document.querySelector('.ad-sidebar').classList.contains('ad-sidebar-open')");
            ensure($browser->evaluate("document.querySelector('[data-mobile-menu]').getAttribute('aria-expanded') === 'true'"));
            $browser->screenshot($target.'/admin-sidebar-mobile.png');
            $browser->evaluate("document.querySelector('[data-tab=products]').click()");$browser->wait("!!document.querySelector('[data-new-product]') && document.querySelector('[data-sidebar-backdrop]').hidden");
            ensure($browser->evaluate("document.body.style.overflow !== 'hidden'"),'Mobile menu left body locked');
            ensure($browser->evaluate("document.documentElement.scrollWidth <= innerWidth+1"),'Admin mobile overflow');
            $browser->command('Emulation.setDeviceMetricsOverride',['width'=>1440,'height'=>1000,'deviceScaleFactor'=>1,'mobile'=>false]);
            $browser->evaluate("document.querySelector('[data-tab=products]').click()");$browser->wait("!!document.querySelector('[data-edit]')");$browser->evaluate("document.querySelector('[data-edit]').click()");$browser->wait("!!document.querySelector('dialog [name=name]')");$browser->evaluate("(()=>{const f=document.querySelector('dialog form');f.elements.name.value='Khăn tắm PHP đã sửa';f.requestSubmit();})()");$browser->wait("!document.querySelector('dialog') && document.querySelector('#product-table').textContent.includes('Khăn tắm PHP đã sửa')");
            $browser->evaluate("document.querySelector('[data-tab=orders]').click()");$browser->wait("!!document.querySelector('[data-order]')");$browser->evaluate("document.querySelector('[data-order]').click()");$browser->wait("!!document.querySelector('[data-receipt]')");$browser->evaluate("document.querySelector('[data-receipt]').click()");$browser->wait("!!document.querySelector('dialog [name=content]')");$browser->evaluate("(()=>{const f=document.querySelector('dialog form');f.elements.content.value='PHIẾU PHP KIỂM THỬ\\n<script>chỉ là văn bản</script>';f.requestSubmit();})()");$browser->wait("document.querySelector('#toast').textContent === 'Đã lưu phiếu'");$browser->screenshot($target.'/admin-receipt.png');$browser->evaluate("document.querySelector('dialog [data-close]').click()");
        });
        check('Browser: create product, upload image and update banner',function()use($browser,$target){
            $browser->evaluate("document.querySelector('[data-tab=products]').click()");$browser->wait("!!document.querySelector('[data-new-product]')");$browser->evaluate("document.querySelector('[data-new-product]').click()");$browser->wait("!!document.querySelector('dialog [name=name]')");
            $browser->evaluate("(()=>{const f=document.querySelector('dialog form');f.elements.name.value='Sản phẩm PHP mới';f.elements.name.dispatchEvent(new Event('input',{bubbles:true}));f.elements.category.value='Kiểm thử';f.querySelector('[name=v-sku]').value='BROWSER-NEW-1';f.querySelector('[name=v-stock]').value=5;})()");
            $document=$browser->command('DOM.getDocument');$input=$browser->command('DOM.querySelector',['nodeId'=>$document['root']['nodeId'],'selector'=>'dialog input[type=file]']);$browser->command('DOM.setFileInputFiles',['nodeId'=>$input['nodeId'],'files'=>[str_replace('\\','/',$target.'/public_html/favicon.png')]]);$browser->wait("document.querySelector('dialog [name=image]').value.startsWith('/uploads/')");$browser->wait("!document.querySelector('dialog [type=submit]').disabled");$browser->evaluate("document.querySelector('dialog form').requestSubmit()");$browser->wait("!document.querySelector('dialog') && document.querySelector('#product-table').textContent.includes('Sản phẩm PHP mới')");
            $browser->evaluate("document.querySelector('[data-tab=banner]').click()");$browser->wait("!!document.querySelector('#settings-form [name=heroTitle]')");$browser->evaluate("(()=>{const f=document.querySelector('#settings-form');f.elements.heroTitle.value='Banner từ giao diện PHP';f.requestSubmit();})()");$browser->wait("document.querySelector('#toast').textContent === 'Đã lưu thay đổi'");
        });
        require_once __DIR__.'/product-images.php';productImageChecks($browser,$base,$target,$admin);
        sellerBrowserChecks($browser,$base,$target,$admin);
        check('Browser: create and revoke staff; change password',function()use($browser){
            $browser->evaluate("document.querySelector('[data-tab=staff]').click()");$browser->wait("!!document.querySelector('[data-new-staff]')");$browser->evaluate("document.querySelector('[data-new-staff]').click()");$browser->wait("!!document.querySelector('dialog [name=password]')");$browser->evaluate("(()=>{const f=document.querySelector('dialog form');f.elements.name.value='Nhân viên PHP';f.elements.email.value='browser-staff@example.test';f.elements.password.value='BrowserStaff2026!';f.requestSubmit();})()");$browser->wait("!document.querySelector('dialog') && !!document.querySelector('[data-revoke]')");$browser->evaluate("setTimeout(()=>document.querySelector('[data-revoke]').click(),0)");$browser->event('Page.javascriptDialogOpening');$browser->command('Page.handleJavaScriptDialog',['accept'=>true]);$browser->wait("!document.querySelector('[data-revoke]')");
            $browser->evaluate("document.querySelector('[data-password]').click()");$browser->wait("!!document.querySelector('dialog [name=currentPassword]')");$browser->evaluate("(()=>{const f=document.querySelector('dialog form');f.elements.currentPassword.value='ChangedOwner2026!';f.elements.password.value='BrowserOwner2026!';f.elements.confirmation.value='BrowserOwner2026!';f.requestSubmit();})()");$browser->wait("!!document.querySelector('#login')");$browser->evaluate("(()=>{const f=document.querySelector('#login');f.elements.email.value='owner@example.test';f.elements.password.value='BrowserOwner2026!';f.requestSubmit();})()");$browser->wait("!!document.querySelector('[data-tab=settings]')");
        });
        check('Browser: settings save and logout',function()use($browser){
            $browser->evaluate("document.querySelector('[data-tab=settings]').click()");$browser->wait("!!document.querySelector('#settings-form [name=storeName]')");$browser->evaluate("(()=>{const f=document.querySelector('#settings-form');f.elements.storeName.value='FILLICO PHP';f.requestSubmit();})()");$browser->wait("document.querySelector('#toast').textContent === 'Đã lưu thay đổi'");$browser->evaluate("document.querySelector('[data-logout]').click()");$browser->wait("!!document.querySelector('#login')");
        });
    }finally{$browser->close();}
}
