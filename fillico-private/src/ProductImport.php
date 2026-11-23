<?php
declare(strict_types=1);
namespace Fillico;

final class ProductImport {
    private const VISIBLE = 'Đang hiển thị';
    private const HIDDEN = 'Đang ẩn';

    public function __construct(private Store $store, private Catalog $catalog) {}

    public function export(): string {
        $products = $variants = [];
        foreach ($this->store->products() as $product) {
            if (!empty($product['deletedAt'])) continue;
            $products[] = [$product['id'],$product['revision'],$product['name'],$product['category'],$product['description'],$product['active'] ? self::VISIBLE : self::HIDDEN];
            foreach ($product['variants'] as $variant) {
                $variants[] = [$product['id'],$variant['id'],$product['revision'],$variant['name'],$variant['sku'],$variant['price'],$variant['stock']];
            }
        }
        return ProductWorkbook::write(['Sản phẩm'=>$products,'Phân loại'=>$variants]);
    }

    public function import(string $bytes, array $owner): array {
        $sheets = ProductWorkbook::read($bytes);
        $products = array_column($this->store->products(), null, 'id');
        $seenProducts = $seenVariants = $drafts = $errors = $locations = $variantRows = [];
        $productRowsChanged = $variantsUpdated = 0;
        foreach ($sheets['Sản phẩm'] as $row=>$cells) {
            try {
                $id = $this->identifier($cells[0]);
                if (isset($seenProducts[$id])) fail(400, 'Cột A: Mã sản phẩm bị trùng.');
                $seenProducts[$id] = true;
                $product = $this->existing($products, $id, $cells[1], 'B');
                $status = match ($cells[5]) {
                    null => $product['active'],
                    self::VISIBLE => true,
                    self::HIDDEN => false,
                    default => fail(400, 'Cột F: Chọn Đang hiển thị hoặc Đang ẩn.'),
                };
                $edits = [
                    'name'=>$this->text($cells[2],$product['name'],'Tên sản phẩm',2,200,'C'),
                    'category'=>$this->text($cells[3],$product['category'],'Danh mục',1,100,'D'),
                    'description'=>$this->text($cells[4],$product['description'],'Mô tả',0,10000,'E'),
                    'active'=>$status,
                ];
                $draft = $drafts[$id] ?? $product;
                $drafts[$id] = array_replace($draft, $edits);
                if (array_replace($product, $edits) !== $product) $productRowsChanged++;
                $locations[$id] = ['Sản phẩm',$row,'C–F'];
            } catch (HttpError $error) {
                $errors[] = "Sản phẩm · dòng $row · ".$error->getMessage();
            }
        }
        foreach ($sheets['Phân loại'] as $row=>$cells) {
            try {
                $id = $this->identifier($cells[0]);
                $variantId = $this->identifier($cells[1], 'B');
                if (isset($seenVariants[$variantId])) fail(400, 'Cột B: Mã phân loại bị trùng.');
                $seenVariants[$variantId] = true;
                $product = $this->existing($products, $id, $cells[2], 'C');
                $variants = array_column($product['variants'], null, 'id');
                $variant = $variants[$variantId] ?? null;
                if (!$variant) fail(400, 'Cột B: Phân loại không thuộc sản phẩm này.');
                $price = $cells[5] === null ? $variant['price'] : $this->number($cells[5],1000,100000000,'F');
                if (($variant['originalPrice'] ?? 0) > 0 && $price > $variant['originalPrice']) fail(400, 'Cột F: Giá bán không được vượt giá gốc.');
                $edits = [
                    'name'=>$this->text($cells[3],$variant['name'],'Tên phân loại',1,100,'D'),
                    'sku'=>$this->text($cells[4],$variant['sku'],'SKU',1,100,'E'),
                    'price'=>$price,
                    'stock'=>$cells[6] === null ? $variant['stock'] : $this->number($cells[6],0,1000000,'G'),
                ];
                $draft = $drafts[$id] ?? $product;
                foreach ($draft['variants'] as &$item) if ($item['id'] === $variantId) $item = array_replace($item, $edits);
                unset($item);
                $drafts[$id] = $draft;
                $variantRows[$id][$variantId] = $row;
                if (array_replace($variant, $edits) !== $variant) $variantsUpdated++;
                $locations[$id] ??= ['Phân loại',$row,'D–G'];
            } catch (HttpError $error) {
                $errors[] = "Phân loại · dòng $row · ".$error->getMessage();
            }
        }

        $updates = [];
        foreach ($drafts as $id=>$draft) {
            if ($draft === $products[$id]) continue;
            $skus = [];
            $duplicates = [];
            foreach ($draft['variants'] as $variant) {
                $sku = $variant['sku'];
                if (isset($skus[$sku])) {
                    foreach ([$variant['id'],$skus[$sku]] as $variantId) {
                        if (isset($variantRows[$id][$variantId])) $duplicates[$variantRows[$id][$variantId]] = true;
                    }
                }
                $skus[$sku] = $variant['id'];
            }
            foreach ($duplicates as $row=>$_) {
                $errors[] = "Phân loại · dòng $row · cột E: SKU bị trùng trong sản phẩm.";
            }
            if ($duplicates) continue;
            try {
                $updates[] = $this->catalog->product($draft, (string)$id, $products[$id]);
            } catch (HttpError $error) {
                [$sheet,$row,$columns] = $locations[$id];
                $errors[] = "$sheet · dòng $row · cột $columns: ".$error->getMessage();
            }
        }
        if ($errors) fail(422, 'Tệp có lỗi. Chưa cập nhật sản phẩm nào.', ['errors'=>$errors]);
        // API mutations hold the shop row lock from the revision checks through commit.
        foreach ($updates as $product) $this->store->saveProduct($product);
        $result = ['productsUpdated'=>count($updates),'variantsUpdated'=>$variantsUpdated,
            'unchangedRows'=>array_sum(array_map('count',$sheets))-$productRowsChanged-$variantsUpdated];
        if ($updates) $this->store->audit($owner,'product.import',$result);
        return $result;
    }

    private function identifier(mixed $value, string $column = 'A'): string {
        if (!is_string($value) || $value === '' || strlen($value)>400) fail(400, "Cột $column: Mã phải là văn bản và không được bỏ trống.");
        return $value;
    }

    private function existing(array $products, string $id, mixed $revision, string $column): array {
        $product = $products[$id] ?? null;
        if (!$product || !empty($product['deletedAt'])) fail(400, 'Cột A: Sản phẩm không tồn tại hoặc đã xóa.');
        if ($this->number($revision,1,PHP_INT_MAX,$column) !== $product['revision']) fail(409, "Cột $column: Sản phẩm đã thay đổi từ lúc xuất. Hãy xuất file mới.");
        return $product;
    }

    private function number(mixed $value, int $min, int $max, string $column): int {
        if (is_string($value) && preg_match('/^[0-9]{1,15}$/D',$value)) $value = (int)$value;
        if (!is_int($value) || $value<$min || $value>$max) fail(400, "Cột $column: Nhập số nguyên từ $min đến $max.");
        return $value;
    }

    private function text(mixed $value, string $old, string $name, int $min, int $max, string $column): string {
        if ($value === null) return $old;
        try { return txt($value,$name,$min,$max); }
        catch (HttpError $error) { fail(400, "Cột $column: ".$error->getMessage()); }
    }

}
