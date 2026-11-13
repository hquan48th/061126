<?php
declare(strict_types=1);
namespace Fillico;
require_once __DIR__.'/Support.php';
require_once __DIR__.'/Store.php';
require_once __DIR__.'/Auth.php';
require_once __DIR__.'/Catalog.php';
require_once __DIR__.'/Orders.php';
require_once __DIR__.'/Api.php';

function config(string $private): array {
    $file=$private.'/config.php';if(!is_file($file))fail(503,'Cửa hàng chưa được cấu hình.');
    $c=require $file;
    if(!is_array($c)||!isset($c['dsn'],$c['db_user'],$c['db_password'],$c['origin'],$c['uploads_dir']))fail(503,'Cấu hình cửa hàng không hợp lệ.');
    if(!preg_match('~^https?://[^/]+$~D',$c['origin'])||(!str_starts_with($c['origin'],'https://')&&empty($c['allow_http'])))fail(503,'Cấu hình HTTPS không hợp lệ.');return $c;
}
function environmentChecks(): array {
    $checks=['PHP >= 8.3'=>version_compare(PHP_VERSION,'8.3.0','>='),'64-bit integers'=>PHP_INT_SIZE===8,'Argon2id'=>defined('PASSWORD_ARGON2ID')&&in_array('argon2id',password_algos(),true)];
    foreach(['pdo_mysql','json','mbstring','fileinfo'] as $ext)$checks[$ext]=extension_loaded($ext);return $checks;
}
function databaseChecks(Store $s): array {
    $raw=(string)$s->query('SELECT VERSION()')->fetchColumn();
    $maria=stripos($raw,'MariaDB')!==false;$pattern=$maria?'/([0-9]+\.[0-9]+\.[0-9]+)-MariaDB/i':'/^([0-9]+\.[0-9]+\.[0-9]+)/';
    $version=preg_match($pattern,$raw,$m)?$m[1]:'0';
    $schema=$s->query('SELECT MAX(version) FROM schema_migrations')->fetchColumn();
    $tables=$s->query('SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()')->fetchAll();
    $engines=array_column($tables,'engine','name');$inno=true;
    foreach(['products','variants','settings','orders','order_receipts','idempotency','users','sessions','audit','login_attempts','schema_migrations'] as $t)if(strtolower($engines[$t]??'')!=='innodb')$inno=false;
    return ['Database version'=>version_compare($version,$maria?'10.6.0':'8.0.16','>='),'Schema version 1'=>(int)$schema===1,'All application tables InnoDB'=>$inno];
}
function guard(array $c,string $path,string $method): void {
    if(!in_array($method,['GET','HEAD','OPTIONS'],true)){
        $origin=$_SERVER['HTTP_ORIGIN']??null;
        if($origin!==null&&$origin!==$c['origin'])fail(403,'Yêu cầu từ nguồn không được phép.');
        if(($_SERVER['HTTP_SEC_FETCH_SITE']??'')==='cross-site')fail(403,'Yêu cầu từ nguồn không được phép.');
        $type=strtolower(trim(explode(';',$_SERVER['CONTENT_TYPE']??'')[0]));
        $emptyLogout=$path==='/api/auth/logout'&&empty($_SERVER['HTTP_TRANSFER_ENCODING'])&&(int)($_SERVER['CONTENT_LENGTH']??0)===0;
        if($path!=='/api/admin/uploads'&&!$emptyLogout&&$method!=='DELETE'&&$type!=='application/json')fail(415,'Yêu cầu cần dữ liệu JSON.');
    }
    $limit=$path==='/api/admin/uploads'?5*1024*1024:1024*1024;
    if((int)($_SERVER['CONTENT_LENGTH']??0)>$limit)fail(413,'Dữ liệu tải lên vượt kích thước cho phép.');
}
function jsonBody(string $path): mixed {
    if($path==='/api/admin/uploads')return null;
    $raw=file_get_contents('php://input',false,null,0,1024*1024+1);
    if($raw===false||strlen($raw)>1024*1024)fail(413,'Dữ liệu tải lên vượt kích thước cho phép.');
    if($raw==='')return null;
    try{return decode($raw);}catch(\JsonException){fail(400,'Dữ liệu JSON không hợp lệ.');}
}
function serveUpload(array $c,string $path): never {
    $name=substr($path,9);
    // Existing Node uploads are UUID filenames. No directories, symlinks or script suffixes.
    if(!preg_match('/^[a-f0-9-]{36}\.(?:png|jpg|webp)$/D',$name))fail(404,'Không tìm thấy ảnh.');
    $file=$c['uploads_dir'].'/'.$name;if(!is_file($file)||is_link($file))fail(404,'Không tìm thấy ảnh.');
    $ext=pathinfo($file,PATHINFO_EXTENSION);header('Content-Type: '.['png'=>'image/png','jpg'=>'image/jpeg','webp'=>'image/webp'][$ext]);
    header('Cache-Control: public, max-age=604800');header('Content-Length: '.filesize($file));readfile($file);exit;
}
