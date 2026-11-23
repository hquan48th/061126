<?php
declare(strict_types=1);
// Real HTTP + isolated MySQL/MariaDB tests. Never reads the shop's config or data.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
$dsn=getenv('FILLICO_TEST_DSN')?:'mysql:host=127.0.0.1;port=3306;charset=utf8mb4';
if(!preg_match('/(?:^mysql:|;)host=(127\.0\.0\.1|localhost)(?:;|$)/',$dsn)||str_contains($dsn,'dbname=')){fwrite(STDERR,"Tests require a localhost ADMIN DSN without dbname.\n");exit(1);}
$root=dirname(__DIR__);$id=bin2hex(random_bytes(5));$database='fillico_test_'.$id;$target=$root.'/work/test-'.$id;
require $root.'/fillico-private/src/bootstrap.php';
function ensure(bool $condition,string $message='Assertion failed'):void{if(!$condition)throw new RuntimeException($message);}
function copyTestTree(string $from,string $to):void{if(is_dir($from)){mkdir($to,0755,true);foreach(new FilesystemIterator($from,FilesystemIterator::SKIP_DOTS) as $f)copyTestTree($f->getPathname(),$to.'/'.$f->getFilename());}else{copy($from,$to);}}
$passed=0;$failed=0;
function check(string $name,callable $fn):void{global $passed,$failed;try{$fn();$passed++;echo "PASS $name\n";}catch(Throwable $err){$failed++;echo "FAIL $name: ".$err->getMessage()."\n";}}
class Client {
    public string $cookie='';
    public function __construct(public string $base){}
    public function request(string $path,string $method='GET',mixed $body=null,array $extra=[],?string $raw=null):array{
        $headers=['Connection: close'];if($this->cookie!=='')$headers[]='Cookie: '.$this->cookie;
        if(!in_array($method,['GET','HEAD'],true))$headers[]='Origin: '.$this->base;
        if($body!==null){$headers[]='Content-Type: application/json';$body=json_encode($body,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);}
        foreach($extra as $k=>$v)$headers[]=$k.': '.$v;
        $context=stream_context_create(['http'=>['method'=>$method,'header'=>implode("\r\n",$headers),'content'=>$raw??$body??'','ignore_errors'=>true,'timeout'=>15,'follow_location'=>0]]);
        $text=file_get_contents($this->base.$path,false,$context);$responseHeaders=$http_response_header??[];$status=0;
        foreach($responseHeaders as $line){if(preg_match('~^HTTP/\S+ (\d+)~',$line,$m))$status=(int)$m[1];if(preg_match('/^Set-Cookie: (fillico_(?:session|customer)=[^;]*)/i',$line,$m))$this->cookie=$m[1];}
        return ['status'=>$status,'text'=>$text?:'','json'=>json_decode($text?:'',true),'headers'=>$responseHeaders];
    }
}
$admin=null;$server=null;
try{
    $admin=new PDO($dsn,getenv('FILLICO_TEST_USER')?:'root',getenv('FILLICO_TEST_PASSWORD')?:'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $admin->exec('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');$admin->exec('USE `'.$database.'`');$admin->exec(file_get_contents($root.'/fillico-private/migrations/001_initial.sql'));
    check('First release uses three installation scripts and maps orders to the account ID',function()use($admin,$root){
        $legacyOrder='{"id":"migration-order","code":"FLLEGACY","status":"pending"}';
        $statement=$admin->prepare('INSERT INTO orders(id,code,token_hash,data) VALUES(?,?,?,?)');
        $tokenHash=hash('sha256','migration-order-token');
        $statement->execute(['migration-order','FLLEGACY',$tokenHash,$legacyOrder]);
        try {
            $migration=file_get_contents($root.'/fillico-private/migrations/002_customer_accounts.sql');
            $admin->exec($migration);
            $admin->exec($migration);
            $migration=file_get_contents($root.'/fillico-private/migrations/003_customer_orders.sql');
            $admin->exec($migration);
            $admin->exec($migration);
            ensure((int)$admin->query('SELECT MAX(version) FROM schema_migrations')->fetchColumn()===3);
            $record=$admin->query("SELECT token_hash,data FROM orders WHERE id='migration-order'")->fetch(PDO::FETCH_ASSOC);
            ensure($record===['token_hash'=>$tokenHash,'data'=>$legacyOrder]);
            foreach (['customers','customer_sessions','customer_orders'] as $table) ensure((int)$admin->query("SELECT COUNT(*) FROM $table")->fetchColumn()===0);
        } finally {
            $admin->exec("DELETE FROM orders WHERE id='migration-order'");
        }
    });
    mkdir($target,0755,true);copyTestTree($root.'/public_html',$target.'/public_html');mkdir($target.'/fillico-private');
    foreach(['src','templates','defaults.php','.htaccess'] as $name)copyTestTree($root.'/fillico-private/'.$name,$target.'/fillico-private/'.$name);
    mkdir($target.'/fillico-private/uploads');copy($root.'/router.php',$target.'/router.php');
    $socket=stream_socket_server('tcp://127.0.0.1:0',$errno,$error);$address=stream_socket_get_name($socket,false);fclose($socket);$port=(int)substr(strrchr($address,':'),1);$base='http://127.0.0.1:'.$port;
    $token=bin2hex(random_bytes(32));$config=['dsn'=>$dsn.';dbname='.$database,'db_user'=>getenv('FILLICO_TEST_USER')?:'root','db_password'=>getenv('FILLICO_TEST_PASSWORD')?:'','origin'=>$base,'uploads_dir'=>$target.'/fillico-private/uploads','allow_http'=>true,'setup_token'=>$token];
    file_put_contents($target.'/fillico-private/config.php','<?php return '.var_export($config,true).';');
    $server=proc_open([PHP_BINARY,'-S','127.0.0.1:'.$port,'-t',$target.'/public_html',$target.'/router.php'],[0=>['pipe','r'],1=>['file',$target.'/server.log','a'],2=>['file',$target.'/server.log','a']],$pipes,$target,null,['bypass_shell'=>true]);fclose($pipes[0]);
    for($i=0;$i<60;$i++){$conn=@fsockopen('127.0.0.1',$port,$errno,$error,.1);if($conn){fclose($conn);break;}usleep(100000);}
    $owner=new Client($base);$guest=new Client($base);$ownerPassword='OwnerTest2026!';
    check('Disabled local installer explains missing setup token instead of a blank page',function()use($guest,$target,$config){
        $file=$target.'/fillico-private/config.php';$original=file_get_contents($file);$disabled=$config;$disabled['setup_token']='';
        try{file_put_contents($file,'<?php return '.var_export($disabled,true).';');$r=$guest->request('/setup.php');ensure($r['status']===404);ensure(str_contains($r['text'],'tools/configure-local.php'));ensure(!str_contains($r['text'],$config['setup_token']));}
        finally{file_put_contents($file,$original);}
    });
    check('Installer checks PHP requirements',function()use($guest){$r=$guest->request('/setup.php');ensure($r['status']===200);ensure(str_contains($r['text'],'GD PNG/JPEG/WebP'));ensure(!str_contains($r['text'],'Chưa đạt'));});
    check('Installer creates owner and default settings',function()use($guest,$token,$ownerPassword,$admin,$base){
        $context=stream_context_create(['http'=>['method'=>'POST','header'=>"Content-Type: application/x-www-form-urlencoded\r\nOrigin: $base",'content'=>http_build_query(['token'=>$token,'email'=>'owner@example.test','name'=>'Chủ cửa hàng','password'=>$ownerPassword,'repeat'=>$ownerPassword]),'ignore_errors'=>true]]);$text=file_get_contents($base.'/setup.php',false,$context);ensure(str_contains($text,'Đã tạo chủ cửa hàng'),$text);ensure((int)$admin->query('SELECT COUNT(*) FROM users')->fetchColumn()===1);ensure((int)$admin->query('SELECT COUNT(*) FROM products')->fetchColumn()===0);});
    check('Installer locks after completion',fn()=>ensure($guest->request('/setup.php')['status']===404));
    check('PHP renders homepage without a bundle',function()use($guest){$r=$guest->request('/');ensure($r['status']===200,$r['text']);ensure(str_contains($r['text'],'Tinh tế trong từng chi tiết.'));ensure(!str_contains($r['text'],'/src/main.tsx'));ensure(str_contains($r['text'],'/assets/shop.js'));});
    check('Admin and deep links render directly in PHP',function()use($guest){foreach(['/admin','/admin/orders','/gio-hang','/thanh-toan','/tra-cuu','/chinh-sach/bao-mat'] as $path)ensure($guest->request($path)['status']===200,$path);ensure($guest->request('/does-not-exist')['status']===404);});
    check('Private files and traversal stay blocked',function()use($guest){foreach(['/fillico-private/config.php','/.git/config','/tools/reset-password.php','/assets/../../fillico-private/config.php','/assets/..%5c../fillico-private/config.php'] as $path)ensure(in_array($guest->request($path)['status'],[403,404],true),$path);});
    check('Owner login and protected APIs',function()use($owner,$ownerPassword,$guest){ensure($guest->request('/api/admin/orders')['status']===401);$r=$owner->request('/api/auth/login','POST',['email'=>'owner@example.test','password'=>$ownerPassword]);ensure($r['status']===200);ensure($r['json']['user']['role']==='owner');ensure(str_contains(implode('\n',$r['headers']),'HttpOnly'));});
    $product=['name'=>'Khăn tắm cotton','slug'=>'khan-tam-cotton','category'=>'Khăn & vải','description'=>'Khăn mềm mại cho phòng tắm.','image'=>'/images/product-towel.svg','images'=>['/images/product-towel.svg'],'badge'=>'Mới','featured'=>true,'active'=>true,'variants'=>[['id'=>'0','name'=>'Trắng','sku'=>'TEST-001','price'=>100000,'originalPrice'=>120000,'stock'=>3],['id'=>'test-variant-2','name'=>'Be','sku'=>'TEST-002','price'=>150000,'stock'=>10]]];
    $saved=null;
    check('Owner creates product with stable zero variant ID',function()use($owner,$product,&$saved){$r=$owner->request('/api/admin/products','POST',$product);ensure($r['status']===201,json_encode($r));$saved=$r['json']['product'];ensure($saved['variants'][0]['id']==='0');});
    check('Product gallery persists cover source and framing without schema changes',function()use($owner,$product){
        $p=$product;$p['slug']='media-api-test';$p['name']='Ảnh sản phẩm thử nghiệm';$p['variants'][0]['id']='media-variant-one';$p['variants'][1]['id']='media-variant-two';$p['images']=['/images/product-amenities.svg','/images/product-towel.svg'];$p['coverSource']='/images/product-amenities.svg';$p['coverCrop']=['zoom'=>1.5,'offsetX'=>.1,'offsetY'=>-.2,'rotation'=>90];
        $r=$owner->request('/api/admin/products','POST',$p);ensure($r['status']===201,json_encode($r));$saved=$r['json']['product'];ensure($saved['images']===$p['images']);ensure($saved['coverSource']===$p['coverSource']);ensure($saved['coverCrop']===$p['coverCrop']);
        $partial=$saved;unset($partial['coverCrop'],$partial['coverSource'],$partial['images']);$r=$owner->request('/api/admin/products/'.$saved['id'],'PUT',$partial);ensure($r['status']===200);ensure($r['json']['product']['coverCrop']===$p['coverCrop']);ensure($r['json']['product']['images']===$p['images']);
    });
    check('Product gallery rejects invalid framing and too many images',function()use($owner,$product){
        foreach([['zoom'=>0,'offsetX'=>0,'offsetY'=>0,'rotation'=>0],['zoom'=>1,'offsetX'=>'wrong','offsetY'=>0,'rotation'=>0],['zoom'=>1,'offsetX'=>0,'offsetY'=>0,'rotation'=>45],['zoom'=>5,'offsetX'=>0,'offsetY'=>0,'rotation'=>0]] as $i=>$crop){$p=$product;$p['slug']='bad-media-'.$i;$p['variants'][0]['id']='bad-media-v-'.$i;$p['variants'][1]['id']='bad-media-v2-'.$i;$p['coverCrop']=$crop;ensure($owner->request('/api/admin/products','POST',$p)['status']===400);}
        $p=$product;$p['slug']='too-many-photos';$p['variants'][0]['id']='many-photo-variant';$p['variants'][1]['id']='many-photo-variant-2';$p['images']=array_fill(0,13,'/images/product-towel.svg');ensure($owner->request('/api/admin/products','POST',$p)['status']===400);
    });
    check('Product pages, search without accents and price filtering',function()use($guest){$r=$guest->request('/san-pham/khan-tam-cotton');ensure($r['status']===200);ensure(str_contains($r['text'],'Khăn tắm cotton'));$r=$guest->request('/');ensure($r['status']===200,'Homepage with products must render completely');ensure(str_contains($r['text'],'id="store-data"'));$r=$guest->request('/san-pham?q=khan%20tam');ensure($r['status']===200);ensure(str_contains($r['text'],'data-product-id'));ensure(str_contains($r['text'],'id="store-data"'));$r=$guest->request('/san-pham?max=50000');ensure($r['status']===200);ensure(!str_contains($r['text'],'data-product-id'));ensure($guest->request('/san-pham/missing')['status']===404);});
    check('HEAD health has no body',function()use($guest){$r=$guest->request('/api/health','HEAD');ensure($r['status']===200);ensure($r['text']==='');});
    $buyer = new Client($base);
    require __DIR__.'/customer-excel.php';
    customerApiChecks($base,$guest,$buyer);
    $payload=['customer'=>['name'=>'Khách kiểm thử','phone'=>'0901234567','email'=>'test@example.test','address'=>'123 Nguyễn Trãi, Thành phố Hồ Chí Minh','note'=>'Giao giờ hành chính'],'items'=>[['variantId'=>'0','quantity'=>2]],'paymentMethod'=>'cod','expectedTotal'=>230000];$created=null;
    check('Checkout computes money on server',function()use($buyer,$payload,&$created){$r=$buyer->request('/api/orders','POST',$payload,['Idempotency-Key'=>'php-test-order-1']);ensure($r['status']===201,json_encode($r));$created=$r['json'];ensure($created['order']['total']===230000);});
    check('Retry after lost response returns the same order',function()use($buyer,$payload,$created,$admin){$r=$buyer->request('/api/orders','POST',$payload,['Idempotency-Key'=>'php-test-order-1']);ensure($r['json']['order']['id']===$created['order']['id']);ensure($r['json']['trackingToken']===$created['trackingToken']);ensure((int)$admin->query('SELECT COUNT(*) FROM orders')->fetchColumn()===3);$data=json_decode($admin->query("SELECT data FROM variants WHERE id='0'")->fetchColumn(),true);ensure($data['stock']===1);});
    check('Conflicting retry and overselling are rejected',function()use($buyer,$payload){$bad=$payload;$bad['customer']['name']='Người khác';ensure($buyer->request('/api/orders','POST',$bad,['Idempotency-Key'=>'php-test-order-1'])['status']===409);ensure($buyer->request('/api/orders','POST',$payload,['Idempotency-Key'=>'php-test-order-2'])['status']===409);});
    check('Total mismatch rolls back stock and order',function()use($buyer,$payload,$admin){$bad=$payload;$bad['items'][0]['quantity']=1;$bad['expectedTotal']=1;ensure($buyer->request('/api/orders','POST',$bad)['status']===409);$data=json_decode($admin->query("SELECT data FROM variants WHERE id='0'")->fetchColumn(),true);ensure($data['stock']===1);ensure((int)$admin->query('SELECT COUNT(*) FROM orders')->fetchColumn()===3);});
    check('Tracking requires private token',function()use($guest,$created){$path='/api/orders/'.$created['order']['code'];ensure($guest->request($path)['status']===404);ensure($guest->request($path.'?token=wrong')['status']===404);ensure($guest->request($path.'?token='.$created['trackingToken'])['status']===200);});
    check('My Orders only shows orders owned by the signed-in buyer',function()use($base,$guest,$buyer,$created){
        $list='/tai-khoan/don-hang';$order=$created['order'];$path=$list.'/'.$order['code'];
        ensure($guest->request($path)['status']===302);
        $r=$buyer->request($list);ensure($r['status']===200&&str_contains($r['text'],$order['code']));
        $r=$buyer->request($path);ensure($r['status']===200&&str_contains($r['text'],$order['customer']['address']));
        $other=new Client($base);
        ensure($other->request('/api/customer/login','POST',['email'=>'second@example.test','password'=>'SecondBuyer2026!'])['status']===200);
        $r=$other->request($list);ensure($r['status']===200&&!str_contains($r['text'],$order['code']));
        $r=$other->request($path);ensure($r['status']===404&&!str_contains($r['text'],$order['customer']['address']));
    });
    check('My Orders paginates the account history newest first',function()use($admin,$buyer,$created){
        $order=$created['order'];$ids=[];
        try{
            for($n=1;$n<=12;$n++){
                $order['id']='paging-fixture-'.$n;$order['code']='FLPAGING'.$n;
                $insert=$admin->prepare('INSERT INTO orders(id,code,token_hash,data) VALUES(?,?,?,?)');
                $insert->execute([$order['id'],$order['code'],hash('sha256',$order['id']),json_encode($order,JSON_THROW_ON_ERROR)]);
                $ids[]=$order['id'];
                $admin->prepare('INSERT INTO customer_orders(order_seq,customer_id) VALUES(?,?)')->execute([$admin->lastInsertId(),$order['customerId']]);
            }
            $url='/tai-khoan/don-hang';
            $first=$buyer->request($url);$second=$buyer->request($url.'?page=2');
            ensure($first['status']===200&&substr_count($first['text'],'buyer-order-card')===12);
            ensure(strpos($first['text'],'FLPAGING12')<strpos($first['text'],'FLPAGING11')&&str_contains($first['text'],'Trang sau'));
            ensure($second['status']===200&&str_contains($second['text'],$created['order']['code'])&&!str_contains($second['text'],'FLPAGING12'));
        }finally{
            foreach($ids as $id)$admin->prepare('DELETE FROM orders WHERE id=?')->execute([$id]);
        }
    });
    check('Stale product edit cannot overwrite stock',function()use($owner,$saved){ensure($owner->request('/api/admin/products/'.$saved['id'],'PUT',$saved)['status']===409);});
    check('Pending order protects its variant from removal',function()use($owner,$saved){$fresh=$owner->request('/api/admin/products')['json']['products'][0];array_shift($fresh['variants']);ensure($owner->request('/api/admin/products/'.$saved['id'],'PUT',$fresh)['status']===409);});
    check('Receipt stores literal text separately from the order',function()use($owner,$created,$admin){$path='/api/admin/orders/'.$created['order']['id'].'/receipt';$content="PHIẾU BÁN HÀNG\n<script>không chạy</script>\nTổng: 230.000đ";ensure($owner->request($path,'PUT',['content'=>$content])['status']===200);ensure($owner->request($path)['json']['receipt']['content']===$content);ensure((int)$admin->query('SELECT COUNT(*) FROM order_receipts')->fetchColumn()===1);});
    check('Soft delete preserves order data and restocks before restore to hidden',function()use($owner,$buyer,$guest,$created,$admin,$saved,$payload){
        $productPath='/api/admin/products/'.$saved['id'];
        ensure($buyer->request('/api/customer/cart','POST',['action'=>'set','variantId'=>'0','quantity'=>1])['status']===200);
        ensure($owner->request($productPath,'DELETE')['status']===200);
        ensure($guest->request('/san-pham/khan-tam-cotton')['status']===404);
        $cart=$buyer->request('/api/customer/cart')['json'];
        ensure(count($cart['items'])===1 && $cart['lines'][0]['issue']==='deleted' && $cart['lines'][0]['productName']===$saved['name']);
        ensure($buyer->request('/api/customer/cart','POST',['action'=>'add','variantId'=>'0','quantity'=>1])['status']===409);
        ensure($buyer->request('/api/orders','POST',$payload)['status']===400);
        $path='/api/admin/orders/'.$created['order']['id'];
        foreach([1,2] as $_)ensure($owner->request($path,'PATCH',['status'=>'cancelled','paymentStatus'=>'unpaid'])['status']===200);
        $variant=json_decode($admin->query("SELECT data FROM variants WHERE id='0'")->fetchColumn(),true);
        ensure($variant['stock']===3);
        ensure($owner->request($path,'PATCH',['status'=>'cancelled','paymentStatus'=>'paid'])['status']===400);
        $restored=$owner->request($productPath.'/restore','POST',['restore'=>true]);
        ensure($restored['status']===200&&!$restored['json']['product']['active']&&empty($restored['json']['product']['deletedAt']));
        ensure($guest->request('/san-pham/khan-tam-cotton')['status']===404);
        $product=$restored['json']['product'];$product['active']=true;
        ensure($owner->request($productPath,'PUT',$product)['status']===200);
    });
    excelChecks($owner,$guest,$target);
    check('Checkout identifies stale prices and individual stock shortages before writing',function()use($buyer,$admin){
        $count=(int)$admin->query('SELECT COUNT(*) FROM orders')->fetchColumn();
        $order=['customer'=>['name'=>'Khách thử đơn giá','phone'=>'0901234567','address'=>'A1'],'items'=>[['variantId'=>'0','quantity'=>1]],'paymentMethod'=>'cod','mode'=>'direct',
            'expectedTotal'=>131000,'expectedQuote'=>['subtotal'=>101000,'shippingFee'=>30000,'prices'=>[['variantId'=>'0','price'=>100000]]]];
        $quote=$buyer->request('/api/orders','POST',$order,['Idempotency-Key'=>'check-quote-price']);
        ensure($quote['status']===409&&$quote['json']['reason']==='quote_changed');
        ensure($quote['json']['quote']['lines'][0]['price']===101000 && $quote['json']['quote']['shippingFee']===30000);
        $order['items'][0]['quantity']=99;
        $short=$buyer->request('/api/orders','POST',$order,['Idempotency-Key'=>'check-stock-detail']);
        ensure($short['status']===409&&$short['json']['reason']==='stock_changed');
        ensure($short['json']['lines'][0]['variantName']==='Trắng'&&$short['json']['lines'][0]['stock']===3);
        ensure((int)$admin->query('SELECT COUNT(*) FROM orders')->fetchColumn()===$count);
    });
    check('My Orders shows transfer instructions only to the order owner',function()use($owner,$buyer,$guest){
        $original=$owner->request('/api/store')['json']['settings']['bankInfo'];
        ensure($owner->request('/api/admin/settings','PUT',['bankInfo'=>"Tài khoản thử 001234\nTên người nhận Fillico"])['status']===200);
        try{
            $r=$buyer->request('/api/orders','POST',[
                'customer'=>['name'=>'Khách chuyển khoản','phone'=>'0901234567','address'=>'A1'],
                'items'=>[['variantId'=>'media-variant-two','quantity'=>1]],'paymentMethod'=>'bank','mode'=>'direct',
            ],['Idempotency-Key'=>'check-bank-instructions']);
            ensure($r['status']===201,json_encode($r['json']));
            $path='/tai-khoan/don-hang/'.$r['json']['order']['code'];
            $detail=$buyer->request($path);
            ensure($detail['status']===200&&str_contains($detail['text'],'Nội dung chuyển khoản')&&str_contains($detail['text'],'001234'));
            ensure($guest->request($path)['status']===302);
        }finally{$owner->request('/api/admin/settings','PUT',['bankInfo'=>$original]);}
    });
    $employee=new Client($base);$staffId=null;
    check('Owner creates staff; whitespace password is rejected',function()use($owner,&$staffId){ensure($owner->request('/api/admin/staff','POST',['name'=>'Nhân viên','email'=>'bad@example.test','password'=>"\u{00A0}StaffPassword2026!"])['status']===400);$r=$owner->request('/api/admin/staff','POST',['name'=>'Nhân viên','email'=>'staff@example.test','password'=>'StaffPassword2026!']);ensure($r['status']===201);$staffId=$r['json']['user']['id'];});
    check('Staff can handle orders but cannot change products/settings or use Excel',function()use($employee){ensure($employee->request('/api/auth/login','POST',['email'=>'staff@example.test','password'=>'StaffPassword2026!'])['status']===200);ensure($employee->request('/api/admin/orders')['status']===200);foreach(['/api/admin/products','/api/admin/products/excel/export','/api/admin/dashboard','/api/admin/settings','/api/admin/staff'] as $path)ensure($employee->request($path)['status']===403,$path);ensure($employee->request('/api/admin/products/excel/import','POST',null,['Content-Type'=>\Fillico\ProductWorkbook::MIME],'file')['status']===403);});
    check('Revocation immediately invalidates staff session',function()use($owner,$employee,$staffId){ensure($owner->request('/api/admin/staff/'.$staffId,'DELETE')['status']===200);ensure($employee->request('/api/auth/me')['status']===401);});
    check('Settings, banner and policies survive reload with escaped HTML',function()use($owner,$guest){ensure($owner->request('/api/admin/settings','PUT',['companyName'=>'Công ty <script>alert(1)</script>','heroTitle'=>'Banner PHP mới','policies'=>(object)['bao-mat'=>'Thông tin <script>riêng tư</script>']])['status']===200);$home=$guest->request('/')['text'];ensure(str_contains($home,'Banner PHP mới'));ensure(!str_contains($home,'<script>alert(1)</script>'));$policy=$guest->request('/chinh-sach/bao-mat')['text'];ensure(str_contains($policy,'&lt;script&gt;riêng tư&lt;/script&gt;'));});
    check('Origin guard rejects cross-site mutations',function()use($owner){$r=$owner->request('/api/admin/settings','PUT',['storeName'=>'Hacked'],['Sec-Fetch-Site'=>'cross-site']);ensure($r['status']===403);});
    check('Password change revokes all sessions',function()use($owner,$ownerPassword){ensure($owner->request('/api/auth/password','POST',['currentPassword'=>$ownerPassword,'password'=>'ChangedOwner2026!'])['status']===200);ensure($owner->request('/api/auth/me')['status']===401);ensure($owner->request('/api/auth/login','POST',['email'=>'owner@example.test','password'=>'ChangedOwner2026!'])['status']===200);});
    check('Logout invalidates current cookie',function()use($owner){ensure($owner->request('/api/auth/logout','POST')['status']===200);ensure($owner->request('/api/auth/me')['status']===401);});
    require __DIR__.'/migration.php';migrationChecks($admin,$target,$root,$dsn);
    if(in_array('--browser',$argv,true)){require __DIR__.'/Browser.php';browserChecks($base,$target,$admin);}
    echo "\n$passed passed, $failed failed. Logs: $target/server.log\n";
}catch(Throwable $err){$failed++;fwrite(STDERR,'Test setup failed: '.$err->getMessage()."\n");}
finally{
    if(is_resource($server)){proc_terminate($server);proc_close($server);}
    if($admin instanceof PDO)$admin->exec('DROP DATABASE IF EXISTS `'.$database.'`');
}
exit($failed?1:0);
