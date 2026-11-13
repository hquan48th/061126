<?php
declare(strict_types=1);
namespace Fillico;

final class Auth {
    public function __construct(private Store $s, private array $config) {}
    public function user(bool $owner=false): array {
        $cookie=$_COOKIE['fillico_session']??'';
        if(!is_string($cookie)||!preg_match('/^[A-Za-z0-9_-]{40,100}$/D',$cookie))fail(401,'Vui lòng đăng nhập.');
        $u=$this->s->one('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>?',[hash('sha256',$cookie),millis()]);
        if(!$u)fail(401,'Phiên đăng nhập đã hết hạn.');
        if($owner&&$u['role']!=='owner')fail(403,'Chỉ chủ cửa hàng được sử dụng chức năng này.');return publicUser($u);
    }
    public function cookie(string $value,int $expires): void {
        setcookie('fillico_session',$value,['expires'=>$expires,'path'=>'/','secure'=>str_starts_with($this->config['origin'],'https://'),'httponly'=>true,'samesite'=>'Lax']);
    }
    public function login(array $d): array {
        $email=email($d['email']??null);$password=txt($d['password']??null,'Mật khẩu',1,200);
        // Do not trust spoofable X-Forwarded-For on shared hosting.
        $key=hash('sha256',$_SERVER['REMOTE_ADDR']??'unknown');$now=millis();
        $a=$this->s->one('SELECT * FROM login_attempts WHERE ip_hash=?',[$key]);
        if($a&&$a['until_ms']>$now&&$a['attempts']>=12){header('Retry-After: '.ceil(($a['until_ms']-$now)/1000));return ['status'=>429,'body'=>['error'=>'Quá nhiều lần đăng nhập. Vui lòng thử lại sau 15 phút.']];}
        $u=$this->s->one('SELECT * FROM users WHERE email=?',[$email]);$valid=verifyPassword($password,$u['password_hash']??'');
        if(!$u||!$valid){
            $count=$a&&$a['until_ms']>$now?$a['attempts']+1:1;$until=$a&&$a['until_ms']>$now?$a['until_ms']:$now+900000;
            $this->s->query('DELETE FROM login_attempts WHERE until_ms<?',[$now]);
            $this->s->query('INSERT INTO login_attempts VALUES(?,?,?) ON DUPLICATE KEY UPDATE attempts=VALUES(attempts),until_ms=VALUES(until_ms)',[$key,$count,$until]);
            // Return error as a result so the failed-attempt counter commits.
            return ['status'=>401,'body'=>['error'=>'Email hoặc mật khẩu không chính xác.']];
        }
        $this->s->query('DELETE FROM login_attempts WHERE ip_hash=?',[$key]);$token=token();
        $this->s->query('DELETE FROM sessions WHERE expires<?',[$now]);
        $this->s->query('INSERT INTO sessions VALUES(?,?,?)',[hash('sha256',$token),$u['id'],$now+7*86400000]);
        if(password_needs_rehash($u['password_hash'],PASSWORD_ARGON2ID,['memory_cost'=>19456,'time_cost'=>2,'threads'=>1]))$this->s->query('UPDATE users SET password_hash=? WHERE id=?',[passwordHash($password),$u['id']]);
        $this->cookie($token,time()+7*86400);$this->s->audit($u,'login',[]);return ['status'=>200,'body'=>['user'=>publicUser($u)]];
    }
    public function logout(): array {
        $this->s->query('DELETE FROM sessions WHERE token_hash=?',[hash('sha256',$_COOKIE['fillico_session']??'')]);$this->cookie('',time()-3600);return ['ok'=>true];
    }
    public function changePassword(array $d,array $u): array {
        $current=txt($d['currentPassword']??null,'Mật khẩu hiện tại',1,200);$password=txt($d['password']??null,'Mật khẩu mới',12,200);
        $row=$this->s->one('SELECT password_hash FROM users WHERE id=?',[$u['id']]);
        if(!verifyPassword($current,$row['password_hash']))fail(400,'Mật khẩu hiện tại không chính xác.');
        $this->s->query('UPDATE users SET password_hash=? WHERE id=?',[passwordHash($password),$u['id']]);
        $this->s->query('DELETE FROM sessions WHERE user_id=?',[$u['id']]);$this->s->audit($u,'password.change',[]);$this->cookie('',time()-3600);return ['ok'=>true];
    }
}
