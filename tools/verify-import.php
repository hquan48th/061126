<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
if($argc!==3){fwrite(STDERR,"php verify-import.php /private/config.php /private/manifest.json\n");exit(1);}
require __DIR__.'/../php/src/bootstrap.php';
try{
    $c=require $argv[1];$m=\Fillico\decode(file_get_contents($argv[2]));$s=new \Fillico\Store($c);$allowed=['products','variants','settings','orders','order_receipts','idempotency','users','sessions','audit'];
    if(($m['format']??null)!==1||array_keys($m['tables'])!==$allowed)throw new RuntimeException('Invalid manifest');
    $s->transaction(function()use($m,$s,$allowed){foreach($allowed as $table){$meta=$m['tables'][$table];foreach($meta['columns'] as $col)if(!preg_match('/^[a-z_]+$/D',$col))throw new RuntimeException('Invalid column');$cols=implode(',',array_map(fn($v)=>'`'.$v.'`',$meta['columns']));$sort=in_array('seq',$meta['columns'],true)?'seq':($table==='order_receipts'?'order_id':($table==='idempotency'?'`key`':($table==='sessions'?'token_hash':'id')));
        $rows=$s->query("SELECT $cols FROM `$table` ORDER BY $sort")->fetchAll(PDO::FETCH_NUM);$hashes=array_map(fn($r)=>hash('sha256',\Fillico\encode($r)),$rows);
        // Source rowid ordering for UUID-key tables without seq differs from target order.
        sort($hashes);$expected=$meta['hashes'];sort($expected);
        if(count($rows)!==$meta['count']||$hashes!==$expected)throw new RuntimeException("Mismatch in $table (count/content). Do not switch traffic.");echo "$table: count and all row hashes match\n";
    }},false);
    foreach($m['uploads'] as $name=>$hash){if(!preg_match('/^[a-f0-9-]{36}\.(png|jpg|webp)$/D',$name)||!is_file($c['uploads_dir'].'/'.$name)||hash_file('sha256',$c['uploads_dir'].'/'.$name)!==$hash)throw new RuntimeException('Upload mismatch');}
    echo "Uploads match. Session revocation and password reset are intentional; reset accounts AFTER this verification.\n";
}catch(Throwable $e){fwrite(STDERR,$e->getMessage()."\n");exit(1);}
