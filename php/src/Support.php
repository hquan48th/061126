<?php
declare(strict_types=1);
namespace Fillico;

final class HttpError extends \RuntimeException {
    public function __construct(public int $status, string $message) { parent::__construct($message); }
}
function fail(int $status, string $message): never { throw new HttpError($status, $message); }
function encode(mixed $v): string { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR); }
function decode(string $v): mixed {
    // Preserve {} versus [], including empty policy maps, while using arrays internally.
    $convert=function(mixed $x)use(&$convert):mixed {
        if($x instanceof \stdClass){$p=get_object_vars($x);if(!$p||array_is_list($p)){foreach($p as $k=>$v)$x->{(string)$k}=$convert($v);return $x;}return array_map($convert,$p);}
        return is_array($x)?array_map($convert,$x):$x;
    };
    return $convert(json_decode($v, false, 512, JSON_THROW_ON_ERROR));
}
function now(): string { return (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z'); }
function millis(): int { return (int) floor(microtime(true) * 1000); }
function uuid(): string {
    $b = random_bytes(16); $b[6] = chr((ord($b[6]) & 15) | 64); $b[8] = chr((ord($b[8]) & 63) | 128);
    $h = bin2hex($b); return substr($h,0,8).'-'.substr($h,8,4).'-'.substr($h,12,4).'-'.substr($h,16,4).'-'.substr($h,20);
}
function token(): string { return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '='); }
function txt(mixed $v, string $label, int $min=0, int $max=1000): string {
    if (!is_string($v)) fail(400,"$label không hợp lệ.");
    $v = preg_replace('/^[\s\x{FEFF}]+|[\s\x{FEFF}]+$/u', '', $v);
    if ($v === null) fail(400,"$label không hợp lệ.");
    // JS String.length counts UTF-16 code units.
    $len = strlen(mb_convert_encoding($v, 'UTF-16LE', 'UTF-8')) / 2;
    if ($len < $min || $len > $max) fail(400,"$label không hợp lệ.");
    return $v;
}
function integer(mixed $v, string $label, int $min=0, int $max=1000000000): int {
    if ((!is_int($v) && !is_float($v)) || !is_finite((float)$v) || floor($v)!=(float)$v || $v<$min || $v>$max) fail(400,"$label không hợp lệ.");
    return (int)$v;
}
function obj(mixed $v): array {
    if ($v instanceof \stdClass) return get_object_vars($v);
    if (!is_array($v) || array_is_list($v)) fail(400,'Dữ liệu không hợp lệ.'); return $v;
}
function email(mixed $v, bool $required=true): string {
    $v = mb_strtolower(txt($v ?? '', 'Email', $required?3:0,254),'UTF-8');
    if ($v !== '' && !preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/u',$v)) fail(400,'Email không hợp lệ.'); return $v;
}
function imagePath(mixed $v): string {
    $v = txt($v,'Đường dẫn ảnh',1,2000);
    if (!preg_match('~^/(?:images|uploads)/[A-Za-z0-9_./-]+$~D',$v) && !preg_match('~^https://[^\s]+$~D',$v)) fail(400,'Ảnh phải là đường dẫn nội bộ hoặc liên kết HTTPS.');
    if (str_contains($v,'..')) fail(400,'Đường dẫn ảnh không hợp lệ.'); return $v;
}
function publicUser(array $u): array { return array_intersect_key($u,array_flip(['id','email','name','role'])); }
function passwordHash(string $v): string { return password_hash($v, PASSWORD_ARGON2ID, ['memory_cost'=>19456,'time_cost'=>2,'threads'=>1]); }
function verifyPassword(string $v, string $saved): bool {
    // Node scrypt hashes are intentionally disabled on import; see reset-password.php.
    if (!str_starts_with($saved,'$argon2id$')) { password_verify($v, '$argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$GaeDrxYnjQSwonynJhQw6xYu+4iq0LT2DKZXMFouD74'); return false; }
    return password_verify($v,$saved);
}
