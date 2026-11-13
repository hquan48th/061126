<?php
declare(strict_types=1);
namespace Fillico;

final class Store {
    public \PDO $db;
    public function __construct(array $c) {
        $this->db = new \PDO($c['dsn'],$c['db_user'],$c['db_password'],[
            \PDO::ATTR_ERRMODE=>\PDO::ERRMODE_EXCEPTION, \PDO::ATTR_EMULATE_PREPARES=>false,
            \PDO::ATTR_DEFAULT_FETCH_MODE=>\PDO::FETCH_ASSOC, \PDO::ATTR_STRINGIFY_FETCHES=>false,
        ]);
        $this->db->exec("SET NAMES utf8mb4 COLLATE utf8mb4_bin");
        $this->db->exec("SET time_zone = '+00:00'");
    }
    public function query(string $sql, array $params=[]): \PDOStatement { $s=$this->db->prepare($sql);$s->execute($params);return $s; }
    public function one(string $sql, array $params=[]): ?array { return $this->query($sql,$params)->fetch() ?: null; }
    public function transaction(callable $fn, bool $shopLock=true): mixed {
        $this->db->beginTransaction();
        try {
            // All business writes take this lock FIRST, including auth and catalog edits.
            // It serializes short shop mutations across PHP workers, protecting JSON stock,
            // revision checks, idempotency, cancellation and authorization revocation.
            if ($shopLock && !$this->one('SELECT id FROM settings WHERE id=1 FOR UPDATE')) fail(503,'Cửa hàng chưa được khởi tạo.');
            $r=$fn(); $this->db->commit(); return $r;
        } catch (\Throwable $e) { if($this->db->inTransaction())$this->db->rollBack(); throw $e; }
    }
    public function products(bool $activeOnly=false): array {
        $rows=$this->query('SELECT id,data FROM products ORDER BY seq')->fetchAll();
        $vs=$this->query('SELECT product_id,data FROM variants ORDER BY seq')->fetchAll();$group=[];
        foreach($vs as $v)$group[$v['product_id']][]=decode($v['data']);
        $out=[];foreach($rows as $row){$p=decode($row['data']);$p['revision']??=1;$p['variants']=$group[$row['id']]??[];if(!$activeOnly||$p['active'])$out[]=$p;}return $out;
    }
    public function product(string $id): ?array { foreach($this->products() as $p)if($p['id']===$id)return $p;return null; }
    public function saveProduct(array $p): void {
        $vs=$p['variants'];unset($p['variants']);$p['revision']??=1;
        if($this->one('SELECT id FROM products WHERE id=?',[$p['id']]))$this->query('UPDATE products SET slug=?,data=? WHERE id=?',[$p['slug'],encode($p),$p['id']]);
        else $this->query('INSERT INTO products(id,slug,data) VALUES(?,?,?)',[$p['id'],$p['slug'],encode($p)]);
        $existing=$this->query('SELECT id FROM variants WHERE product_id=?',[$p['id']])->fetchAll();$ids=[];
        foreach($vs as $v){$other=$this->one('SELECT product_id FROM variants WHERE id=?',[$v['id']]);if($other&&$other['product_id']!==$p['id'])fail(400,'Phân loại thuộc sản phẩm khác.');
            $this->query('INSERT INTO variants(id,product_id,data) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)',[$v['id'],$p['id'],encode($v)]);$ids[]=$v['id'];}
        foreach($existing as $v)if(!in_array($v['id'],$ids,true))$this->query('DELETE FROM variants WHERE id=?',[$v['id']]);
    }
    public function setStock(string $id,int $stock): void {
        $r=$this->one('SELECT data,product_id FROM variants WHERE id=?',[$id]);if(!$r)return;
        $v=decode($r['data']);$v['stock']=$stock;$this->query('UPDATE variants SET data=? WHERE id=?',[encode($v),$id]);
        $r=$this->one('SELECT data FROM products WHERE id=?',[$r['product_id']]);$p=decode($r['data']);$p['revision']=($p['revision']??1)+1;
        $this->query('UPDATE products SET data=? WHERE id=?',[encode($p),$p['id']]);
    }
    public function settings(): array { $r=$this->one('SELECT data FROM settings WHERE id=1');if(!$r)fail(503,'Cửa hàng chưa được khởi tạo.');return decode($r['data']); }
    public function saveSettings(array $v): void { $this->query('UPDATE settings SET data=? WHERE id=1',[encode($v)]); }
    public function orders(): array { return array_map(fn($r)=>decode($r['data']),$this->query('SELECT data FROM orders ORDER BY seq DESC')->fetchAll()); }
    public function order(string $id): ?array { $r=$this->one('SELECT data FROM orders WHERE id=?',[$id]);return $r?decode($r['data']):null; }
    public function saveOrder(array $v,?string $token=null): void {
        if($token!==null)$this->query('INSERT INTO orders(id,code,token_hash,data) VALUES(?,?,?,?)',[$v['id'],$v['code'],hash('sha256',$token),encode($v)]);
        else $this->query('UPDATE orders SET data=? WHERE id=?',[encode($v),$v['id']]);
    }
    public function audit(?array $u,string $action,mixed $detail): void { $this->query('INSERT INTO audit(user_id,action,detail,created_at) VALUES(?,?,?,?)',[$u['id']??null,$action,encode($detail?:new \stdClass),now()]); }
}
