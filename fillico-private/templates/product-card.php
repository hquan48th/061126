<?php use function Fillico\{h,money,icon}; ?>
<article class="product-card reveal <?= !empty($p['coverCrop'])?'has-cover-crop':'' ?>" data-product-id="<?= h($p['id']) ?>">
 <div class="product-image-wrap"><a href="<?= h($url) ?>" tabindex="-1"><img loading="lazy" src="<?= h($p['image']) ?>" alt="<?= h($p['name']) ?>"></a>
  <div class="product-badges"><?php if(!$available): ?><span class="badge sold-out">Hết hàng</span><?php elseif($p['badge']??''): ?><span class="badge"><?= h($p['badge']) ?></span><?php endif ?></div>
  <button class="favorite-btn" data-favorite="<?= h($p['id']) ?>" aria-label="Yêu thích <?= h($p['name']) ?>" aria-pressed="false"><?= icon('heart') ?></button>
  <a class="product-quick" href="<?= h($url) ?>">Chọn phân loại <?= icon('arrow') ?></a>
 </div><div class="product-info"><span class="product-category"><?= h($p['category']) ?></span><a class="product-name" href="<?= h($url) ?>"><?= h($p['name']) ?></a>
 <div class="price-row"><strong><?= money($price) ?></strong><a class="add-small" href="<?= h($url) ?>" aria-label="Chọn mua <?= h($p['name']) ?>">+</a></div>
 <div class="product-meta"><span class="stock-dot <?= $available?'':'empty' ?>"></span><?= $available?'Sẵn hàng':'Tạm hết hàng' ?> · <?= count($p['variants']) ?> phân loại</div></div>
</article>
