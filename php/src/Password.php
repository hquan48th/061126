<?php
declare(strict_types=1);
namespace Fillico;
// Identical policy for every credential entry point, including offline reset.
function passwordInput(mixed $value, int $min=12): string {
    if(!is_string($value)||!preg_match('//u',$value)||preg_match('/^[\s\x{FEFF}]|[\s\x{FEFF}]$/u',$value))throw new \InvalidArgumentException('Mật khẩu không được có khoảng trắng ở đầu hoặc cuối.');
    $length=strlen(iconv('UTF-8','UTF-16LE',$value))/2;
    if($length<$min||$length>200)throw new \InvalidArgumentException('Mật khẩu cần từ '.$min.' đến 200 ký tự.');
    return $value;
}
function credential(mixed $value,int $min=12): string {
    try{return passwordInput($value,$min);}catch(\InvalidArgumentException $e){fail(400,$e->getMessage());}
}
