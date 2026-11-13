<?php
declare(strict_types=1);
namespace Fillico;

final class Catalog {
    public function __construct(private Store $s) {}
    public function product(mixed $input,string $id,?array $previous=null): array {
        $d=obj($input);
        if($previous&&((!is_int($d['revision']??null)&&!is_float($d['revision']??null))||$d['revision']!=$previous['revision']))fail(409,'Sản phẩm hoặc tồn kho đã thay đổi. Vui lòng tải lại trước khi chỉnh sửa.');
        if(!isset($d['variants'])||!is_array($d['variants'])||!array_is_list($d['variants'])||count($d['variants'])<1||count($d['variants'])>50)fail(400,'Sản phẩm cần từ 1 đến 50 phân loại.');
        $seen=[];$skus=[];$vs=[];
        foreach($d['variants'] as $input){
            $v=obj($input);$vid=empty($v['id'])?uuid():txt($v['id'],'Mã phân loại',1,100);
            if(in_array($vid,$seen,true))fail(400,'Mã phân loại bị trùng.');$seen[]=$vid;
            $other=$this->s->one('SELECT product_id FROM variants WHERE id=?',[$vid]);if($other&&$other['product_id']!==$id)fail(400,'Phân loại thuộc sản phẩm khác.');
            $sku=txt($v['sku']??null,'SKU',1,100);if(in_array($sku,$skus,true))fail(400,'SKU bị trùng trong sản phẩm.');$skus[]=$sku;
            $price=integer($v['price']??null,'Giá',1000,100000000);$original=isset($v['originalPrice'])?integer($v['originalPrice'],'Giá gốc',0,100000000):null;
            if($original&&$original<$price)fail(400,'Giá gốc phải lớn hơn hoặc bằng giá bán.');
            $row=['id'=>$vid,'name'=>txt($v['name']??null,'Tên phân loại',1,100),'sku'=>$sku,'price'=>$price,'stock'=>integer($v['stock']??null,'Tồn kho',0,1000000)];if($original)$row['originalPrice']=$original;$vs[]=$row;
        }
        if($previous)foreach($previous['variants'] as $v)if(!in_array($v['id'],$seen,true))foreach($this->s->orders() as $o)if(!in_array($o['status'],['cancelled','delivered'],true))foreach($o['items'] as $i)if($i['variantId']===$v['id'])fail(409,'Không thể xóa phân loại đang có đơn hàng chưa hoàn tất.');
        $slug=txt($d['slug']??null,'Đường dẫn',1,160);if(!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D',$slug))fail(400,'Đường dẫn chỉ gồm chữ thường, số và dấu gạch ngang.');
        if($this->s->one('SELECT id FROM products WHERE slug=? AND id<>?',[$slug,$id]))fail(409,'Đường dẫn sản phẩm đã tồn tại.');
        if(!is_bool($d['featured']??null)||!is_bool($d['active']??null))fail(400,'Trạng thái sản phẩm không hợp lệ.');
        $p=['id'=>$id,'slug'=>$slug,'name'=>txt($d['name']??null,'Tên sản phẩm',2,200),'category'=>txt($d['category']??null,'Danh mục',1,100),'description'=>txt($d['description']??null,'Mô tả',0,10000),'image'=>imagePath($d['image']??null),'badge'=>txt($d['badge']??'','Nhãn',0,50),'featured'=>$d['featured'],'active'=>$d['active'],'variants'=>$vs,'revision'=>($previous['revision']??0)+1];
        if(array_key_exists('images',$d)){if(!is_array($d['images'])||!array_is_list($d['images'])||count($d['images'])>12)fail(400,'Tối đa 12 ảnh mỗi sản phẩm.');$p['images']=array_map(__NAMESPACE__.'\\imagePath',$d['images']);}return $p;
    }
    public function settings(mixed $input): array {
        $d=array_replace($this->s->settings(),obj($input));$out=[];
        foreach(['storeName'=>['Tên cửa hàng',1,100],'tagline'=>['Khẩu hiệu',0,200],'phone'=>['Điện thoại',0,30],'address'=>['Địa chỉ',0,500],'companyName'=>['Tên công ty',0,200],'taxCode'=>['Mã số thuế',0,30],'heroTitle'=>['Tiêu đề banner',1,200],'heroSubtitle'=>['Mô tả banner',0,1000],'bankInfo'=>['Thông tin chuyển khoản',0,2000]] as $key=>$args)$out[$key]=txt($d[$key]??null,...$args);
        $out['email']=email($d['email']??null,false);$out['heroImage']=imagePath($d['heroImage']??null);
        if(!is_bool($d['heroEnabled']??null))fail(400,'Trạng thái banner không hợp lệ.');$out['heroEnabled']=$d['heroEnabled'];
        $out['shippingFee']=integer($d['shippingFee']??null,'Phí giao hàng',0,10000000);$out['freeShippingThreshold']=integer($d['freeShippingThreshold']??null,'Ngưỡng miễn phí vận chuyển',0,1000000000);
        if(array_key_exists('policies',$d)){$ps=obj($d['policies']);if(count($ps)>20)fail(400,'Tối đa 20 chính sách.');$out['policies']=[];foreach($ps as $k=>$v){if(!preg_match('/^[a-z0-9-]{1,80}$/D',(string)$k))fail(400,'Mã chính sách không hợp lệ.');$out['policies'][$k]=txt($v,'Nội dung chính sách',0,20000);}$out['policies']=(object)$out['policies'];}return $out;
    }
}
