<?php
declare(strict_types=1);
namespace Fillico;

final class Api {
    private Auth $auth;
    public function __construct(private Store $s,private array $c) { $this->auth=new Auth($s,$c); }
    public function dispatch(string $method,string $path,mixed $body): array {
        $s=$this->s;$a=$this->auth;$catalog=new Catalog($s);$orders=new Orders($s);
        $ok=fn($b,$status=200)=>['status'=>$status,'body'=>$b];
        if($method==='GET'&&$path==='/api/health')return $ok(['status'=>'ok']);
        if($method==='GET'&&$path==='/api/store')return $ok(['products'=>$s->products(true),'settings'=>$s->settings()]);
        if($method==='POST'&&$path==='/api/auth/login')return $a->login(obj($body));
        if($path==='/api/auth/me'&&$method==='GET')return $ok(['user'=>$a->user()]);
        if($path==='/api/auth/logout'&&$method==='POST'){$a->user();return $ok($a->logout());}
        if($path==='/api/auth/password'&&$method==='POST')return $ok($a->changePassword(obj($body),$a->user()));
        if($path==='/api/orders'&&$method==='POST')return $ok($orders->create($body,$_SERVER['HTTP_IDEMPOTENCY_KEY']??null),201);
        if($method==='GET'&&preg_match('~^/api/orders/([^/]+)$~D',$path,$m)){
            $token=is_string($_GET['token']??null)?$_GET['token']:'';$r=$s->one('SELECT data FROM orders WHERE code=? AND token_hash=?',[$m[1],hash('sha256',$token)]);
            if(!$r)fail(404,'Không tìm thấy đơn hàng hoặc mã tra cứu không đúng.');return $ok(['order'=>decode($r['data'])]);
        }
        if(!str_starts_with($path,'/api/admin'))fail(404,'Không tìm thấy API.');
        $u=$a->user();
        if($path==='/api/admin/orders'&&$method==='GET')return $ok(['orders'=>$s->orders()]);
        if(preg_match('~^/api/admin/orders/([^/]+)/receipt$~D',$path,$m)){
            $id=$m[1];if(!$s->order($id))fail(404,'Không tìm thấy đơn hàng.');
            if($method==='GET'){$r=$s->one('SELECT content,updated_at FROM order_receipts WHERE order_id=?',[$id]);return $ok(['receipt'=>$r?['content'=>$r['content'],'updatedAt'=>$r['updated_at']]:null]);}
            if($method==='PUT'){$d=obj($body);$content=txt($d['content']??null,'Nội dung phiếu',1,30000);$time=now();$s->query('INSERT INTO order_receipts VALUES(?,?,?) ON DUPLICATE KEY UPDATE content=VALUES(content),updated_at=VALUES(updated_at)',[$id,$content,$time]);$s->audit($u,'receipt.update',['orderId'=>$id]);return $ok(['receipt'=>['content'=>$content,'updatedAt'=>$time]]);}
        }
        if($method==='PATCH'&&preg_match('~^/api/admin/orders/([^/]+)$~D',$path,$m))return $ok(['order'=>$orders->update($m[1],$body,$u)]);
        $u=$a->user(true);
        if($path==='/api/admin/dashboard'&&$method==='GET'){
            $os=$s->orders();$pending=0;$revenue=0;$low=0;foreach($os as $o){if($o['status']==='pending')$pending++;if($o['paymentStatus']==='paid'&&$o['status']!=='cancelled')$revenue+=$o['total'];}
            foreach($s->products(true) as $p)foreach($p['variants'] as $v)if($v['stock']<10){$low++;break;}
            return $ok(['summary'=>['totalOrders'=>count($os),'pendingOrders'=>$pending,'revenue'=>$revenue,'lowStockProducts'=>$low],'recentOrders'=>array_slice($os,0,6)]);
        }
        if($path==='/api/admin/products'){
            if($method==='GET')return $ok(['products'=>$s->products()]);
            if($method==='POST'){$p=$catalog->product($body,uuid());$s->saveProduct($p);$s->audit($u,'product.create',['id'=>$p['id']]);return $ok(['product'=>$p],201);}
        }
        if(preg_match('~^/api/admin/products/([^/]+)$~D',$path,$m)&&in_array($method,['PUT','DELETE'],true)){
            $p=$s->product($m[1]);if(!$p)fail(404,'Không tìm thấy sản phẩm.');
            if($method==='PUT'){$p=$catalog->product($body,$p['id'],$p);$s->saveProduct($p);$s->audit($u,'product.update',['id'=>$p['id']]);return $ok(['product'=>$p]);}
            $p['active']=false;$p['revision']++;$s->saveProduct($p);$s->audit($u,'product.archive',['id'=>$p['id']]);return $ok(['ok'=>true]);
        }
        if($path==='/api/admin/settings'){
            if($method==='GET')return $ok(['settings'=>$s->settings()]);
            if($method==='PUT'){$d=$catalog->settings($body);$s->saveSettings($d);$s->audit($u,'settings.update',[]);return $ok(['settings'=>$d]);}
        }
        if($path==='/api/admin/uploads'&&$method==='POST')return $ok($this->upload($u),201);
        if($path==='/api/admin/staff'){
            if($method==='GET')return $ok(['staff'=>$s->query('SELECT id,name,email,role FROM users ORDER BY seq')->fetchAll()]);
            if($method==='POST'){$d=obj($body);$user=['id'=>uuid(),'name'=>txt($d['name']??null,'Họ tên',2,100),'email'=>email($d['email']??null),'role'=>'staff'];$password=credential($d['password']??null);
                if($s->one('SELECT id FROM users WHERE email=?',[$user['email']]))fail(409,'Email đã tồn tại.');$s->query('INSERT INTO users(id,email,name,role,password_hash) VALUES(?,?,?,?,?)',[$user['id'],$user['email'],$user['name'],$user['role'],passwordHash($password)]);$s->audit($u,'staff.create',['id'=>$user['id']]);return $ok(['user'=>$user],201);}
        }
        if($method==='DELETE'&&preg_match('~^/api/admin/staff/([^/]+)$~D',$path,$m)){
            $r=$s->one('SELECT role FROM users WHERE id=?',[$m[1]]);if(!$r)fail(404,'Không tìm thấy nhân viên.');if($r['role']==='owner')fail(400,'Không thể xóa tài khoản chủ cửa hàng.');
            $s->query('DELETE FROM sessions WHERE user_id=?',[$m[1]]);$s->query('DELETE FROM users WHERE id=?',[$m[1]]);$s->audit($u,'staff.delete',['id'=>$m[1]]);return $ok(['ok'=>true]);
        }
        fail(404,'Không tìm thấy API.');
    }
    private function upload(array $u): array {
        $bytes=file_get_contents('php://input',false,null,0,5*1024*1024+1);
        if($bytes===false||strlen($bytes)<12)fail(400,'Ảnh không hợp lệ.');
        if(strlen($bytes)>5*1024*1024)fail(413,'Dữ liệu tải lên vượt kích thước cho phép.');
        $type=strtolower(explode(';',$_SERVER['CONTENT_TYPE']??'')[0]);$types=['image/png'=>'png','image/jpeg'=>'jpg','image/webp'=>'webp'];
        $info=@getimagesizefromstring($bytes);$mime=(new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        if(!isset($types[$type])||!$info||$info['mime']!==$type||$mime!==$type)fail(400,'Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP hợp lệ.');
        if($info[0]<1||$info[1]<1||$info[0]>16000||$info[1]>16000||$info[0]*$info[1]>40000000)fail(400,'Ảnh tối đa 40 triệu pixel và 16.000 pixel mỗi chiều.');
        if(!extension_loaded('gd'))fail(503,'Máy chủ cần GD hỗ trợ PNG, JPEG và WebP.');
        // Reserve ample memory for decoding and reject warnings from damaged streams.
        $limit=ini_get('memory_limit');$budget=(int)$limit;
        if($budget>0){$unit=strtolower(substr($limit,-1));$budget*=match($unit){'g'=>1073741824,'m'=>1048576,'k'=>1024,default=>1};
            if(memory_get_usage(true)+strlen($bytes)*2+$info[0]*$info[1]*8+16777216>$budget)fail(413,'Ảnh vượt bộ nhớ xử lý cho phép.');}
        if($type==='image/png'){
            $offset=8;$ended=false;$pixels=false;$length=strlen($bytes);
            while($offset+12<=$length){
                $size=unpack('N',substr($bytes,$offset,4))[1];
                if($size>$length-$offset-12)fail(400,'Dữ liệu PNG không đầy đủ.');
                $chunk=substr($bytes,$offset+4,4+$size);$kind=substr($chunk,0,4);
                if(hash('crc32b',$chunk)!==bin2hex(substr($bytes,$offset+8+$size,4)))fail(400,'PNG sai checksum.');
                $offset+=12+$size;if($kind==='IDAT')$pixels=true;
                if($kind==='IEND'){$ended=$size===0&&$offset===$length;break;}
            }
            if(!$ended||!$pixels)fail(400,'Dữ liệu PNG không đầy đủ.');
        }
        if(memory_get_usage(true)+strlen($bytes)*2+$info[0]*$info[1]*8+16777216>268435456)fail(413,'Ảnh vượt giới hạn tài nguyên xử lý.');
        $image=false;
        set_error_handler(static function(){throw new \RuntimeException('Invalid image stream');});
        try{$image=imagecreatefromstring($bytes);}catch(\Throwable){fail(400,'Dữ liệu ảnh bị hỏng.');}finally{restore_error_handler();}
        if(!$image)fail(400,'Dữ liệu ảnh bị hỏng.');
        imagedestroy($image);
        $dir=$this->c['uploads_dir'];if(!is_dir($dir)||!is_writable($dir))fail(503,'Thư mục ảnh chưa sẵn sàng. Vui lòng liên hệ quản trị.');
        $name=uuid().'.'.$types[$type];$path=$dir.'/'.$name;$f=fopen($path,'xb');if(!$f)throw new \RuntimeException('upload open');
        try{if(fwrite($f,$bytes)!==strlen($bytes))throw new \RuntimeException('upload write');}finally{fclose($f);}chmod($path,0600);
        try{$this->s->audit($u,'image.upload',['filename'=>$name]);}catch(\Throwable $e){unlink($path);throw $e;}
        return ['url'=>'/uploads/'.$name];
    }
}
