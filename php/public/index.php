<?php
declare(strict_types=1);
// For the fallback layout move fillico-private into public_html; it has its own deny rule.
// Prefer the sibling directory outside public_html shown here.
ini_set('display_errors','0');
header_remove('X-Powered-By');
header('Cache-Control: no-store');
set_error_handler(static function(int $severity,string $message,string $file,int $line): bool {
    if(!(error_reporting() & $severity))return false;
    throw new \ErrorException('Runtime operation failed',0,$severity,$file,$line);
});

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
ini_set('display_errors','0');
header_remove('X-Powered-By');
try {
    $candidates=[dirname(__DIR__).'/fillico-private',__DIR__.'/fillico-private'];
    $configured=array_values(array_filter($candidates,static fn($dir)=>is_file($dir.'/config.php')));
    if(count($configured)!==1)throw new \RuntimeException('Deployment configuration missing or ambiguous');
    $private=$configured[0];
    if(!is_file($private.'/src/bootstrap.php'))throw new \RuntimeException('Runtime unavailable');
    require $private.'/src/bootstrap.php';

    $c=\Fillico\config($private);
    if(empty($c['allow_http'])&&($_SERVER['HTTPS']??'')!=='on'&&($_SERVER['REQUEST_SCHEME']??'')!=='https')\Fillico\fail(403,'Cần truy cập bằng HTTPS.');
    $path=rawurldecode(parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH)?:'/');
    if(str_starts_with($path,'/uploads/'))\Fillico\serveUpload($c,$path);
    header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');
    $method=$_SERVER['REQUEST_METHOD']??'GET';\Fillico\guard($c,$path,$method);
    $body=\Fillico\jsonBody($path);$s=new \Fillico\Store($c);$api=new \Fillico\Api($s,$c);
    $write=!in_array($method,['GET','HEAD','OPTIONS'],true);
    $result=$s->transaction(fn()=>$api->dispatch($method==='HEAD'?'GET':$method,$path,$body),$write);
    http_response_code($result['status']);if($method!=='HEAD')echo \Fillico\encode($result['body']);
}catch(\Fillico\HttpError $e){http_response_code($e->status);header('Content-Type: application/json; charset=utf-8');echo json_encode(['error'=>$e->getMessage()]);}
catch(\Throwable $e){error_log('Fillico request failed: '.get_class($e).' code '.$e->getCode());http_response_code(500);header('Content-Type: application/json; charset=utf-8');echo '{"error":"Có lỗi xử lý. Vui lòng thử lại."}';}
