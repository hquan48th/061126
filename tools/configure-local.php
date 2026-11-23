<?php
declare(strict_types=1);
// CLI helper for this project's portable Windows runtime. Never used on hosting.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
$root=dirname(__DIR__);$private=$root.'/fillico-private';$configPath=$private.'/config.php';
try{
    $port=getenv('FILLICO_LOCAL_DB_PORT')?:'13316';
    if(!ctype_digit($port)||(int)$port<1||(int)$port>65535)throw new RuntimeException('Invalid local database port.');
    $database=getenv('FILLICO_LOCAL_DB_NAME')?:'fillico_local';
    if(!preg_match('/^fillico_local(?:_[a-z0-9]+)*$/D',$database))throw new RuntimeException('Use a database named fillico_local or fillico_local_<suffix>.');
    $username=getenv('FILLICO_LOCAL_DB_USER')?:'root';$password=getenv('FILLICO_LOCAL_DB_PASSWORD')?:'';
    $webPort=getenv('FILLICO_LOCAL_WEB_PORT')?:'8000';
    if(!ctype_digit($webPort)||(int)$webPort<1||(int)$webPort>65535)throw new RuntimeException('Invalid local web port.');
    if(is_file($private.'/setup.lock'))throw new RuntimeException('Already installed. Open /admin; no configuration changed.');
    if(is_file($configPath)){
        $old=require $configPath;
        $placeholder=is_array($old)&&str_contains($old['dsn']??'','YOUR_DATABASE');
        $local=is_array($old)&&!empty($old['allow_http'])&&preg_match('~^http://(?:127\.0\.0\.1|localhost)(?::[0-9]+)?$~D',$old['origin']??'');
        if(!$placeholder&&!$local)throw new RuntimeException('Existing configuration is not a local/test template. Nothing changed.');
    }
    $admin=new PDO('mysql:host=127.0.0.1;port='.$port.';charset=utf8mb4',$username,$password,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $exists=$admin->query("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=".$admin->quote($database))->fetchColumn();
    if(!$exists)$admin->exec('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');
    $admin->exec('USE `'.$database.'`');
    $tables=$admin->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    if($tables){
        $expected=['customers','customer_sessions','customer_orders','product_import_previews','schema_migrations','products','variants','settings','orders','order_receipts','idempotency','users','sessions','audit','login_attempts'];
        if(array_diff($tables,$expected))throw new RuntimeException('Local database contains unrelated tables. Nothing changed.');
        if(in_array('users',$tables,true)&&(int)$admin->query('SELECT COUNT(*) FROM users')->fetchColumn()>0)throw new RuntimeException('Local database already has accounts. Keep its existing config and sign in at /admin.');
    }
    foreach (glob($private.'/migrations/*.sql') as $migration) $admin->exec(file_get_contents($migration));
    $secret=bin2hex(random_bytes(32));
    $config=['dsn'=>'mysql:host=127.0.0.1;port='.$port.';dbname='.$database.';charset=utf8mb4','db_user'=>$username,'db_password'=>$password,'origin'=>'http://127.0.0.1:'.$webPort,'uploads_dir'=>$private.'/uploads','allow_http'=>true,'setup_token'=>$secret];
    if(!is_dir($root.'/.local')&&!mkdir($root.'/.local',0700))throw new RuntimeException('Cannot create private local directory.');
    if(is_file($configPath)){
        $backup=$root.'/.local/php-config-before-'.date('Ymd-His').'-'.bin2hex(random_bytes(3)).'.php';
        if(!copy($configPath,$backup))throw new RuntimeException('Cannot back up existing configuration.');chmod($backup,0600);
    }
    $content="<?php\n// Local development only. Use config.example.php for hosting.\nreturn ".var_export($config,true).";\n";
    $temporary=$private.'/.config-local-'.bin2hex(random_bytes(4)).'.tmp';
    if(file_put_contents($temporary,$content,LOCK_EX)===false)throw new RuntimeException('Cannot write local configuration.');chmod($temporary,0600);
    $tokenPath=$root.'/.local/php-setup-token.txt';
    if(file_put_contents($tokenPath,$secret.PHP_EOL,LOCK_EX)===false)throw new RuntimeException('Cannot save private setup token.');chmod($tokenPath,0600);
    if(!rename($temporary,$configPath))throw new RuntimeException('Cannot activate local configuration.');
    echo "Local configuration ready. No account or demo data created.\n";
    echo 'Installer: '.$config['origin']."/setup.php\nSetup token file: .local/php-setup-token.txt\n";
}catch(Throwable $error){fwrite(STDERR,$error->getMessage().PHP_EOL);exit(1);}
