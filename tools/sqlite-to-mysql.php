<?php
declare(strict_types=1);
// Optional offline migration of a legacy SQLite backup. Hosting needs no SQLite.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/fillico-private/src/bootstrap.php';
$args=array_slice($argv,1);$option=static function($key)use($args){$i=array_search($key,$args,true);return $i===false?null:($args[$i+1]??null);};
$source=$option('--source');$output=$option('--out');$export=in_array('--export',$args,true);
if(!$source||(!$export&&!in_array('--check',$args,true))||($export&&!$output)){fwrite(STDERR,"php tools/sqlite-to-mysql.php --source /backup/store.sqlite --check\nExport: --source /backup/store.sqlite --export --out /NEW/private-directory\n");exit(1);}
$expected=['products'=>['id','slug','data'],'variants'=>['id','product_id','data'],'settings'=>['id','data'],'orders'=>['id','code','token_hash','data'],'order_receipts'=>['order_id','content','updated_at'],'idempotency'=>['key','request_hash','response'],'users'=>['id','email','name','role','password_hash'],'sessions'=>['token_hash','user_id','expires'],'audit'=>['id','user_id','action','detail','created_at']];
function must(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function bounded(mixed $value,int $max):void{must(is_string($value)&&strlen(mb_convert_encoding($value,'UTF-16LE','UTF-8'))/2<=$max,'Invalid or oversized text field');}
function natural(mixed $value,int $max=9007199254740991):void{must(is_int($value)&&$value>=0&&$value<=$max,'Invalid numeric field');}
function objectJson(string $value):array{$v=json_decode($value,false,512,JSON_THROW_ON_ERROR);must($v instanceof stdClass,'JSON object required');return json_decode($value,true,512,JSON_THROW_ON_ERROR);}
function sqlValue(mixed $v):string{return $v===null?'NULL':(is_int($v)?(string)$v:'CONVERT(0x'.bin2hex((string)$v).' USING utf8mb4)');}
try{
    $path=realpath($source);must($path!==false&&is_file($path)&&!is_link($source),'Source must be a regular SQLite backup');
    must(extension_loaded('pdo_sqlite'),'Enable pdo_sqlite locally for legacy migration');
    $readPath=$path;
    if($export){
        must(extension_loaded('sqlite3'),'Enable sqlite3 locally for a consistent snapshot');must(!file_exists($output),'Output must be a NEW directory');must(mkdir($output,0700,true),'Cannot create output');
        $snapshot=$output.'/source-backup.sqlite';$from=new SQLite3($path,SQLITE3_OPEN_READONLY);$to=new SQLite3($snapshot);must($from->backup($to),'SQLite backup failed');$from->close();$to->close();chmod($snapshot,0600);$readPath=$snapshot;
    }
    $db=new PDO('sqlite:'.$readPath,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);$db->exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000');$db->beginTransaction();
    must($db->query('PRAGMA integrity_check')->fetchColumn()==='ok','SQLite integrity check failed');must(!$db->query('PRAGMA foreign_key_check')->fetchAll(),'Broken foreign keys');
    $actual=$db->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);$names=array_keys($expected);sort($names);must($actual===$names,'Unknown/missing tables; review source schema');
    $rows=[];$counts=[];
    foreach($expected as $table=>$columns){must($db->query('PRAGMA table_info("'.$table.'")')->fetchAll(PDO::FETCH_COLUMN,1)===$columns,'Schema differs: '.$table);$rows[$table]=$db->query('SELECT rowid AS __seq,* FROM "'.$table.'" ORDER BY rowid')->fetchAll();$counts[$table]=count($rows[$table]);}
    foreach($rows as $table=>$records)foreach($records as $index=>$r){
        try{
            natural($r['__seq']);foreach($r as $value)if(is_string($value))must(!str_contains($value,"\0"),'NUL in text is unsupported');
            if(isset($r['id']))is_string($r['id'])?bounded($r['id'],100):natural($r['id']);
            if($table==='products'){$p=objectJson($r['data']);must($p['id']===$r['id']&&$p['slug']===$r['slug'],'Product identity mismatch');bounded($r['slug'],160);must(is_bool($p['active'])&&is_bool($p['featured']),'Product flags invalid');if(isset($p['revision']))natural($p['revision']);}
            if($table==='variants'){$v=objectJson($r['data']);must($v['id']===$r['id'],'Variant identity mismatch');bounded($r['product_id'],100);natural($v['stock']);natural($v['price'],100000000);if(isset($v['originalPrice']))natural($v['originalPrice'],100000000);must(in_array($r['product_id'],array_column($rows['products'],'id'),true),'Missing variant product');}
            if($table==='settings'){must($r['id']===1,'Settings ID must be 1');$s=objectJson($r['data']);natural($s['shippingFee']);natural($s['freeShippingThreshold']);must(is_string($s['bankInfo']),'Invalid bankInfo');}
            if($table==='orders'){$o=objectJson($r['data']);must($o['id']===$r['id']&&$o['code']===$r['code'],'Order identity mismatch');bounded($r['code'],100);must((bool)preg_match('/^[0-9a-f]{64}$/D',$r['token_hash']),'Invalid token hash');foreach(['total','subtotal','shippingFee'] as $key)natural($o[$key]);must(in_array($o['status'],['pending','confirmed','packing','shipping','delivered','cancelled'],true)&&in_array($o['paymentStatus'],['unpaid','paid','refunded'],true)&&in_array($o['paymentMethod'],['cod','bank'],true),'Invalid order state');must(is_array($o['items'])&&array_is_list($o['items'])&&count($o['items'])>0,'Invalid order items');must(is_string($o['customer']['name']),'Invalid customer');foreach($o['items'] as $item){natural($item['price']);natural($item['quantity']);bounded($item['variantId'],100);}must(strtotime($o['createdAt'])!==false&&strtotime($o['updatedAt'])!==false,'Invalid order date');}
            if($table==='users'){bounded($r['email'],254);bounded($r['name'],100);bounded($r['password_hash'],255);must(in_array($r['role'],['owner','staff'],true),'Invalid user role');}
            if($table==='sessions'){bounded($r['user_id'],100);natural($r['expires']);must(in_array($r['user_id'],array_column($rows['users'],'id'),true),'Missing session user');}
            if($table==='idempotency'){must((bool)preg_match('/^[A-Za-z0-9_-]{8,100}$/D',$r['key'])&&(bool)preg_match('/^[0-9a-f]{64}$/D',$r['request_hash']),'Invalid idempotency row');$response=objectJson($r['response']);must(is_string($response['trackingToken'])&&in_array($response['order']['id'],array_column($rows['orders'],'id'),true),'Missing replay order/token');}
            if($table==='order_receipts'){bounded($r['order_id'],100);bounded($r['updated_at'],32);must(in_array($r['order_id'],array_column($rows['orders'],'id'),true),'Missing receipt order');}
            if($table==='audit'){bounded($r['action'],100);bounded($r['created_at'],32);json_decode($r['detail'],false,512,JSON_THROW_ON_ERROR);}
        }catch(Throwable $err){throw new RuntimeException($table.' row '.($index+1).': '.$err->getMessage());}
    }
    must(count($rows['settings'])===1,'Exactly one settings row required');must(in_array('owner',array_column($rows['users'],'role'),true),'Source needs an owner');
    $manifest=['format'=>1,'tables'=>[],'revokedSessions'=>count($rows['sessions']),'legacyPasswordReset'=>true,'uploads'=>(object)[]];$uploads=[];
    $sql=['-- PRIVATE EXPORT: import schema into an EMPTY database, then this file.','SET NAMES utf8mb4;','START TRANSACTION;','SET @fillico_import_ok = ('.implode(' AND ',array_map(fn($t)=>'(SELECT COUNT(*) FROM `'.$t.'`)=0',array_merge(array_keys($expected),['login_attempts']))).');',"SELECT IF(@fillico_import_ok=1,'EMPTY TARGET: importing','STOP: target is not empty; no rows imported') AS migration_guard;"];
    $verify=['-- Run BEFORE resetting passwords. All count_ok/content_ok must be 1.','SET NAMES utf8mb4;'];
    foreach($expected as $table=>$columns){
        $records=$table==='sessions'?[]:$rows[$table];$cols=in_array($table,['products','variants','orders','users'],true)?array_merge(['seq'],$columns):$columns;$hashes=[];$sqlHashes=[];
        foreach($records as $r){$values=array_map(fn($col)=>$col==='seq'?$r['__seq']:$r[$col],$cols);$hashes[]=hash('sha256',\Fillico\encode($values));$sqlHashes[]=hash('sha256',implode('',array_map(fn($v)=>$v===null?'-':strlen((string)$v).':'.$v,$values)));$sql[]='INSERT INTO `'.$table.'` (`'.implode('`,`',$cols).'`) SELECT '.implode(',',array_map('sqlValue',$values)).' WHERE @fillico_import_ok=1;';}
        $expression='SHA2(CONCAT('.implode(',',array_map(fn($col)=>"IF(`$col` IS NULL,'-',CONCAT(OCTET_LENGTH(CAST(`$col` AS BINARY)),':',CAST(`$col` AS BINARY)))",$cols)).'),256)';$count=count($records);$content=$sqlHashes?$expression." IN ('".implode("','",$sqlHashes)."')":'0';
        $verify[]="SELECT '$table' AS table_name,COUNT(*)=$count AS count_ok,COALESCE(SUM($content),0)=$count AS content_ok FROM `$table`;";$manifest['tables'][$table]=['columns'=>$cols,'count'=>$count,'hashes'=>$hashes];
    }
    $sql[]='COMMIT;';$uploadDir=dirname($path).'/uploads';if($export)mkdir($output.'/uploads',0700);
    if(is_dir($uploadDir))foreach(new FilesystemIterator($uploadDir,FilesystemIterator::SKIP_DOTS) as $file){$name=$file->getFilename();must((bool)preg_match('/^[a-f0-9-]{36}\.(png|jpg|webp)$/D',$name)&&$file->isFile()&&!$file->isLink(),'Unexpected upload filename or symlink');$uploads[$name]=hash_file('sha256',$file->getPathname());if($export){must(copy($file->getPathname(),$output.'/uploads/'.$name),'Upload copy failed');chmod($output.'/uploads/'.$name,0600);}}
    foreach(['products','settings','orders'] as $table)foreach($rows[$table] as $row){preg_match_all('~/uploads/([A-Za-z0-9_.-]+)~',$row['data'],$matches);foreach($matches[1] as $name)must(isset($uploads[$name]),'Referenced upload missing; filename SHA256: '.hash('sha256',$name));}
    $manifest['uploads']=(object)$uploads;$db->commit();$db=null;
    $report=['sourceCounts'=>$counts,'targetCounts'=>array_map(fn($meta)=>$meta['count'],$manifest['tables']),'uploadCount'=>count($uploads),'revokedSessions'=>$manifest['revokedSessions'],'passwords'=>'Legacy scrypt accounts require offline reset.','snapshot'=>$export?'source-backup.sqlite':null];
    if($export){foreach(['data.sql'=>implode("\n",$sql),'verify.sql'=>implode("\n",$verify),'manifest.json'=>json_encode($manifest,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),'report.json'=>json_encode($report,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)] as $name=>$content){must(file_put_contents($output.'/'.$name,$content."\n")!==false,'Cannot write export');chmod($output.'/'.$name,0600);}}
    echo json_encode($report,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)."\n";
}catch(Throwable $err){fwrite(STDERR,'Migration stopped: '.$err->getMessage()."\nNo source data changed. Incomplete output must NOT be imported.\n");exit(1);}
