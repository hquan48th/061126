<?php
declare(strict_types=1);
// Local PHP CLI router. Hosting uses public_html/.htaccess instead.
if(PHP_SAPI!=='cli-server'){http_response_code(404);exit;}
$root=__DIR__.'/public_html';
$path=rawurldecode(parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH)?:'/');
if(preg_match('~(?:^|/)(?:\.|fillico-private(?:/|$)|src(?:/|$)|tools(?:/|$)|tests(?:/|$))~i',$path)||str_contains($path,'\\')||preg_match('~\.(?:sql|sqlite|db|log|bak|zip|env|ini)$~i',$path)){
    http_response_code(404);exit;
}
$file=realpath($root.$path);$resolvedRoot=realpath($root);
if($file&&str_starts_with($file,$resolvedRoot.DIRECTORY_SEPARATOR)&&is_file($file)){
    if($path==='/setup.php'){require $file;return true;}
    if(pathinfo($file,PATHINFO_EXTENSION)!=='php')return false;
}
require $root.'/index.php';
