<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/fillico-private/src/bootstrap.php';
$checks=\Fillico\environmentChecks();$checks['PDO']=extension_loaded('pdo');$checks['iconv']=extension_loaded('iconv');
foreach($checks as $label=>$ok)echo ($ok?'[OK] ':'[MISSING] ').$label.PHP_EOL;
echo (\Fillico\ProductWorkbook::supported()?'[OK] ':'[OPTIONAL MISSING] ').'Excel (.xlsx): zip, dom'.PHP_EOL;
echo (is_writable(sys_get_temp_dir())?'[OK] ':'[OPTIONAL MISSING] ').'Excel: PHP temporary directory is writable'.PHP_EOL;
$failed=in_array(false,$checks,true);
foreach(['fillico-private','public_html','tools','tests'] as $folder){
    $directory=dirname(__DIR__).'/'.$folder;if(!is_dir($directory))continue;
    foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory,FilesystemIterator::SKIP_DOTS)) as $file){
        if($file->getExtension()!=='php'||$file->getFilename()==='config.php')continue;
        $process=proc_open([PHP_BINARY,'-l',$file->getPathname()],[1=>['pipe','w'],2=>['pipe','w']],$pipes);
        $output=stream_get_contents($pipes[1]).stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);$code=proc_close($process);if($code!==0){$failed=true;echo $output;}
    }
}
echo $failed?"PHP checks FAILED.\n":"PHP environment and syntax OK.\n";exit($failed?1:0);
