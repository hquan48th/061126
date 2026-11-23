<?php
declare(strict_types=1);
// PHP CLI only. Package source assets directly; no compilation or Git required.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
$root=dirname(__DIR__);$target=$argv[1]??$root.'/work/hosting';
if(file_exists($target)||file_exists($target.'.zip')){fwrite(STDERR,"Output already exists. Choose a NEW directory.\n");exit(1);}
function copyTree(string $from,string $to): void {
    if(is_link($from))throw new RuntimeException('Symlinks are not packaged.');
    if(is_dir($from)){if(!mkdir($to,0755,true)&&!is_dir($to))throw new RuntimeException('Cannot create directory.');foreach(new FilesystemIterator($from,FilesystemIterator::SKIP_DOTS) as $item)copyTree($item->getPathname(),$to.'/'.$item->getFilename());}
    elseif(!copy($from,$to))throw new RuntimeException('Cannot copy file.');
}
try{
    if(!mkdir($target,0755,true))throw new RuntimeException('Cannot create output.');
    copyTree($root.'/public_html',$target.'/public_html');
    mkdir($target.'/fillico-private',0750);
    foreach(['src','templates','migrations','defaults.php','config.example.php','.htaccess'] as $name)copyTree($root.'/fillico-private/'.$name,$target.'/fillico-private/'.$name);
    mkdir($target.'/fillico-private/uploads',0700);copyTree($root.'/fillico-private/uploads/.htaccess',$target.'/fillico-private/uploads/.htaccess');
    copyTree($root.'/docs',$target.'/docs');copyTree($root.'/README.md',$target.'/README.md');
    copyTree($root.'/router.php',$target.'/router.php');
    mkdir($target.'/tools');foreach(['reset-password.php','verify-import.php','sqlite-to-mysql.php','migrate.php','check.php','configure-local.php','seed-demo.php','demo-products.json'] as $name)if(is_file($root.'/tools/'.$name))copyTree($root.'/tools/'.$name,$target.'/tools/'.$name);
    $hashes=[];$it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($target,FilesystemIterator::SKIP_DOTS));
    foreach($it as $file)if($file->isFile())$hashes[str_replace('\\','/',substr($file->getPathname(),strlen($target)+1))]=hash_file('sha256',$file->getPathname());ksort($hashes);
    file_put_contents($target.'/BUILD.json',json_encode(['runtime'=>'PHP 8.3+ / MySQL or MariaDB','builtAt'=>gmdate('c'),'sha256'=>$hashes],JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR)."\n");
    if(class_exists(ZipArchive::class)){
        $zip=new ZipArchive();if($zip->open($target.'.zip',ZipArchive::CREATE|ZipArchive::EXCL)!==true)throw new RuntimeException('Cannot create ZIP.');
        foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($target,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::SELF_FIRST) as $file){$relative=str_replace('\\','/',substr($file->getPathname(),strlen($target)+1));if($file->isDir())$zip->addEmptyDir($relative);else $zip->addFile($file->getPathname(),$relative);}$zip->close();echo 'ZIP: '.$target.".zip\n";
    }
    echo 'Hosting files: '.$target."\n";
}catch(Throwable $err){fwrite(STDERR,$err->getMessage()."\n");exit(1);}
