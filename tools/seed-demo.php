<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/fillico-private/src/bootstrap.php';
try{
    $file=$argv[1]??dirname(__DIR__).'/fillico-private/config.php';$c=require $file;
    if(empty($c['allow_http'])||!preg_match('~^http://(?:127\.0\.0\.1|localhost)(?::[0-9]+)?$~D',$c['origin']))throw new RuntimeException('Demo data is allowed only on localhost HTTP.');
    $s=new \Fillico\Store($c);$s->transaction(function()use($s){
        if($s->products()||$s->orders())throw new RuntimeException('Shop must have no products or orders. Nothing changed.');
        $products=json_decode(file_get_contents(__DIR__.'/demo-products.json'),true,512,JSON_THROW_ON_ERROR);$catalog=new \Fillico\Catalog($s);
        foreach($products as $p)$s->saveProduct($catalog->product($p,$p['id']));
        $s->audit(null,'demo.seed',['count'=>count($products)]);echo count($products)." demo products created.\n";
    });
}catch(Throwable $err){fwrite(STDERR,$err->getMessage()."\n");exit(1);}
