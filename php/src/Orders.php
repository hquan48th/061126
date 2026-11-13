<?php
declare(strict_types=1);
namespace Fillico;

final class Orders {
    public function __construct(private Store $s) {}
    private function fingerprint(array $customer,array $quantities,string $payment): string {
        ksort($quantities,SORT_STRING);$items=[];foreach($quantities as $id=>$q)$items[]=[(string)$id,$q];
        return hash('sha256',encode([$customer,$items,$payment]));
    }
    public function create(mixed $body,?string $key): array {
        $in=obj($body);$d=obj($in['customer']??null);
        $customer=['name'=>txt($d['name']??null,'Họ tên',2,100),'phone'=>txt($d['phone']??null,'Số điện thoại',9,20),'email'=>email($d['email']??null,false),'address'=>txt($d['address']??null,'Địa chỉ',10,500),'note'=>txt($d['note']??'','Ghi chú',0,1000)];
        if(!preg_match('/^(?:\+84|0)[0-9 .()-]{8,15}$/D',$customer['phone']))fail(400,'Số điện thoại không hợp lệ.');
        $payment=$in['paymentMethod']??null;if(!in_array($payment,['cod','bank'],true))fail(400,'Phương thức thanh toán không hợp lệ.');
        if(!isset($in['items'])||!is_array($in['items'])||!array_is_list($in['items'])||count($in['items'])<1||count($in['items'])>100)fail(400,'Giỏ hàng cần từ 1 đến 100 sản phẩm.');
        $qs=[];foreach($in['items'] as $item){$item=obj($item);$id=txt($item['variantId']??null,'Phân loại',1,100);$q=integer($item['quantity']??null,'Số lượng',1,999);$qs[$id]=($qs[$id]??0)+$q;if($qs[$id]>999)fail(400,'Số lượng tối đa là 999 mỗi phân loại.');}
        if($key!==null&&!preg_match('/^[a-zA-Z0-9_-]{8,100}$/D',$key))fail(400,'Mã yêu cầu không hợp lệ.');
        $requestHash=$this->fingerprint($customer,$qs,$payment);
        if($key!==null){$saved=$this->s->one('SELECT * FROM idempotency WHERE `key`=?',[$key]);if($saved){
            $response=decode($saved['response']);$o=$response['order'];$oldQs=[];foreach($o['items'] as $item)$oldQs[$item['variantId']]=($oldQs[$item['variantId']]??0)+$item['quantity'];
            // Compare normalized payload to the saved order, also supporting Node's old hash algorithm.
            $c=$o['customer'];$c=['name'=>$c['name'],'phone'=>$c['phone'],'email'=>$c['email']??'','address'=>$c['address'],'note'=>$c['note']??''];
            if(!hash_equals($requestHash,$this->fingerprint($c,$oldQs,$o['paymentMethod'])))fail(409,'Mã yêu cầu đã dùng cho một đơn hàng khác.');return $response;
        }}
        $settings=$this->s->settings();if($payment==='bank'&&trim($settings['bankInfo'])==='')fail(400,'Cửa hàng chưa cấu hình thanh toán chuyển khoản.');
        $catalog=[];foreach($this->s->products(true) as $p)foreach($p['variants'] as $v)$catalog[$v['id']]=[$p,$v];
        $items=[];$subtotal=0;
        foreach($qs as $id=>$quantity){
            if(!isset($catalog[$id]))fail(400,'Sản phẩm không còn được bán.');[$p,$v]=$catalog[$id];
            if($quantity>$v['stock'])fail(409,$p['name'].' — '.$v['name'].' chỉ còn '.$v['stock'].' sản phẩm.');
            $this->s->setStock((string)$id,$v['stock']-$quantity);
            $items[]=['variantId'=>(string)$id,'productName'=>$p['name'],'variantName'=>$v['name'],'image'=>$p['image'],'sku'=>$v['sku'],'price'=>$v['price'],'quantity'=>$quantity];$subtotal+=$v['price']*$quantity;
        }
        $shipping=$settings['freeShippingThreshold']>0&&$subtotal>=$settings['freeShippingThreshold']?0:$settings['shippingFee'];
        if(array_key_exists('expectedTotal',$in)&&((!is_int($in['expectedTotal'])&&!is_float($in['expectedTotal']))||$in['expectedTotal']!=$subtotal+$shipping))fail(409,'Giá hoặc phí vận chuyển đã thay đổi. Vui lòng kiểm tra lại tổng tiền trước khi đặt hàng.');
        $time=now();$token=token();$o=['id'=>uuid(),'code'=>'FL'.strtoupper(base_convert((string)millis(),10,36)).strtoupper(bin2hex(random_bytes(3))),'customer'=>$customer,'items'=>$items,'subtotal'=>$subtotal,'shippingFee'=>$shipping,'total'=>$subtotal+$shipping,'paymentMethod'=>$payment,'status'=>'pending','paymentStatus'=>'unpaid','createdAt'=>$time,'updatedAt'=>$time];
        $this->s->saveOrder($o,$token);$response=['order'=>$o,'trackingToken'=>$token];
        if($key!==null)$this->s->query('INSERT INTO idempotency VALUES(?,?,?)',[$key,$requestHash,encode($response)]);
        $this->s->audit(null,'order.create',['id'=>$o['id'],'code'=>$o['code']]);return $response;
    }
    public function update(string $id,mixed $body,array $user): array {
        $d=obj($body);$o=$this->s->order($id);if(!$o)fail(404,'Không tìm thấy đơn hàng.');
        $transitions=['pending'=>['confirmed','cancelled'],'confirmed'=>['packing','cancelled'],'packing'=>['shipping','cancelled'],'shipping'=>['delivered'],'delivered'=>[],'cancelled'=>[]];
        $status=$d['status']??$o['status'];if($status!==$o['status']&&!in_array($status,$transitions[$o['status']],true))fail(400,'Không thể chuyển sang trạng thái đơn hàng này.');
        $pay=$d['paymentStatus']??$o['paymentStatus'];if(!in_array($pay,['unpaid','paid','refunded'],true))fail(400,'Trạng thái thanh toán không hợp lệ.');
        if($status==='cancelled'&&$o['paymentStatus']==='unpaid'&&$pay==='paid')fail(400,'Không thể ghi nhận thanh toán cho đơn đã hủy.');
        if(($o['paymentStatus']==='paid'&&$pay==='unpaid')||($o['paymentStatus']==='refunded'&&$pay!=='refunded'))fail(400,'Không thể chuyển ngược trạng thái thanh toán.');
        if($pay==='refunded'&&(!in_array($o['paymentStatus'],['paid','refunded'],true)||$status!=='cancelled'))fail(400,'Chỉ hoàn tiền cho đơn đã thanh toán và đã hủy.');
        if($status==='cancelled'&&$o['status']!=='cancelled'){
            $vs=[];foreach($this->s->products() as $p)foreach($p['variants'] as $v)$vs[$v['id']]=$v;
            foreach($o['items'] as $i)if(isset($vs[$i['variantId']])){$v=$vs[$i['variantId']];$this->s->setStock($v['id'],$v['stock']+$i['quantity']);$vs[$v['id']]['stock']+=$i['quantity'];}
        }
        $from=$o['status'];$o['status']=$status;$o['paymentStatus']=$pay;$o['updatedAt']=now();$this->s->saveOrder($o);$this->s->audit($user,'order.update',['id'=>$id,'from'=>$from,'to'=>$status,'paymentStatus'=>$pay]);return $o;
    }
}
