<?php
// Asset timestamps make browser refresh pick up edits without a build step.
$publicAssets=dirname(__DIR__,2).'/public_html/assets';
if(!is_file($publicAssets.'/admin.js'))$publicAssets=dirname(__DIR__,2).'/assets';
$assetVersion=static fn(string $name)=>(string)filemtime($publicAssets.'/'.$name);
?>
<!doctype html>
<html lang="vi">
<head>
 <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
 <title>Quản trị · Fillico</title><link rel="icon" href="/favicon.png">
 <link rel="stylesheet" href="/assets/shop.css?v=<?= $assetVersion('shop.css') ?>">
 <link rel="stylesheet" href="/assets/admin.css?v=<?= $assetVersion('admin.css') ?>">
 <link rel="stylesheet" href="/assets/php.css?v=<?= $assetVersion('php.css') ?>">
 <link rel="stylesheet" href="/assets/product-images.css?v=<?= $assetVersion('product-images.css') ?>">
</head>
<body>
 <div id="admin-root" class="admin-root"><div class="loading-screen" role="status">Đang tải trang quản trị…</div></div>
 <noscript>Vui lòng bật JavaScript để sử dụng trang quản trị.</noscript>
 <div id="toast" class="ad-toast" role="status" hidden></div>
 <script src="/assets/common.js?v=<?= $assetVersion('common.js') ?>" defer></script>
 <script src="/assets/icons.js?v=<?= $assetVersion('icons.js') ?>" defer></script>
 <script src="/assets/product-images.js?v=<?= $assetVersion('product-images.js') ?>" defer></script>
 <script src="/assets/admin.js?v=<?= $assetVersion('admin.js') ?>" defer></script>
</body>
</html>
