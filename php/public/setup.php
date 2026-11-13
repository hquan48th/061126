<?php
declare(strict_types=1);
$private=dirname(__DIR__).'/fillico-private';
require $private.'/src/bootstrap.php';
ini_set('display_errors','0');
header_remove('X-Powered-By');
header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');header("Content-Security-Policy: default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
function h(string $v): string { return htmlspecialchars($v,ENT_QUOTES,'UTF-8'); }
try {
    $c=\Fillico\config($private);
    if(empty($c['setup_token'])||strlen($c['setup_token'])<43||is_file($private.'/setup.lock')){http_response_code(404);exit;}
    if(empty($c['allow_http'])&&($_SERVER['HTTPS']??'')!=='on'&&($_SERVER['REQUEST_SCHEME']??'')!=='https')\Fillico\fail(403,'Cần truy cập bằng HTTPS.');
    $checks=\Fillico\environmentChecks();$ready=!in_array(false,$checks,true);
    if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
        if(($_SERVER['HTTP_ORIGIN']??'')!==$c['origin']||($_SERVER['HTTP_SEC_FETCH_SITE']??'')==='cross-site')\Fillico\fail(403,'Yêu cầu từ nguồn không được phép.');
        if(!is_string($_POST['token']??null)||!hash_equals($c['setup_token'],$_POST['token']))\Fillico\fail(403,'Mã cài đặt không đúng.');
        if(!$ready)\Fillico\fail(503,'Môi trường chưa đáp ứng yêu cầu.');
        $email=\Fillico\email($_POST['email']??null);$name=\Fillico\txt($_POST['name']??null,'Họ tên',2,100);$password=\Fillico\txt($_POST['password']??null,'Mật khẩu',12,200);
        if($password!==($_POST['repeat']??null))\Fillico\fail(400,'Mật khẩu nhập lại không khớp.');
        if(!is_dir($c['uploads_dir'])||!is_writable($c['uploads_dir'])||!is_writable($private))\Fillico\fail(503,'Kiểm tra quyền ghi thư mục riêng và uploads.');
        $s=new \Fillico\Store($c);
        if(in_array(false,\Fillico\databaseChecks($s),true))\Fillico\fail(503,'Database chưa đạt phiên bản/schema/InnoDB yêu cầu. Kiểm tra hướng dẫn và liên hệ hosting.');
        $s->transaction(function()use($s,$private,$email,$name,$password){
            $defaults=file_get_contents($private.'/defaults.json');\Fillico\decode($defaults);
            $s->query('INSERT IGNORE INTO settings(id,data) VALUES(1,?)',[$defaults]);$s->one('SELECT id FROM settings WHERE id=1 FOR UPDATE');
            if($s->one('SELECT id FROM users LIMIT 1'))\Fillico\fail(409,'Database đã có tài khoản. Không thể cài đặt lại.');
            $id=\Fillico\uuid();$s->query('INSERT INTO users(id,email,name,role,password_hash) VALUES(?,?,?,?,?)',[$id,$email,$name,'owner',\Fillico\passwordHash($password)]);$s->audit(['id'=>$id],'setup.complete',[]);
        },false);
        if(file_put_contents($private.'/setup.lock','Installed '.\Fillico\now(),LOCK_EX)===false)throw new \RuntimeException('setup lock write failed');chmod($private.'/setup.lock',0600);
        echo '<!doctype html><meta charset="utf-8"><title>FILLICO</title><p>Đã tạo chủ cửa hàng. Xóa setup.php, xóa setup_token trong config.php. Không có sản phẩm mẫu được tự động thêm.</p><a href="/admin">Đăng nhập quản trị</a>';exit;
    }
    echo '<!doctype html><html lang="vi"><meta charset="utf-8"><title>Cài đặt FILLICO</title><h1>Kiểm tra môi trường</h1><ul>';
    foreach($checks as $label=>$pass)echo '<li>'.h($label).': '.($pass?'Đạt':'Chưa đạt').'</li>';
    echo '</ul><p>Nhập SQL schema qua phpMyAdmin trước. Chỉ dùng cho database mới. Cài đặt không nhập sản phẩm mẫu.</p>';
    if($ready)echo '<form method="post"><p><label>Mã cài đặt <input name="token" required autocomplete="off" type="password"></label></p><p><label>Họ tên <input name="name" required maxlength="100"></label></p><p><label>Email <input name="email" type="email" required></label></p><p><label>Mật khẩu mới <input name="password" type="password" required minlength="12" maxlength="200" autocomplete="new-password"></label></p><p><label>Nhập lại mật khẩu <input name="repeat" type="password" required autocomplete="new-password"></label></p><button>Tạo chủ cửa hàng</button></form>';
    echo '</html>';
}catch(\Fillico\HttpError $e){http_response_code($e->status);echo '<meta charset="utf-8"><p>'.h($e->getMessage()).'</p>';}
catch(\Throwable $e){error_log('Fillico setup failed: '.get_class($e).' code '.$e->getCode());http_response_code(503);echo '<meta charset="utf-8"><p>Chưa cài đặt được. Kiểm tra schema, cấu hình database và quyền thư mục trong hướng dẫn. Chi tiết nằm trong log riêng của hosting.</p>';}
