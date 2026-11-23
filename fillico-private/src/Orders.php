<?php
declare(strict_types=1);
namespace Fillico;

final class Orders {
    public function __construct(private Store $s) {}
    private function fingerprint(array $customer,array $quantities,string $payment): string {
        ksort($quantities,SORT_STRING);$items=[];foreach($quantities as $id=>$q)$items[]=[(string)$id,$q];
        return hash('sha256',encode([$customer,$items,$payment]));
    }
    public function create(mixed $body,?string $key,array $buyer): array {
        $in=obj($body);$d=obj($in['customer']??null);
        $phone = preg_replace('/[\s-]+/u', '', txt($d['phone']??null,'Số điện thoại',1,40));
        if (str_starts_with($phone, '+84')) $phone = '0'.substr($phone, 3);
        if (!preg_match('/^0[35789][0-9]{8}$/D', $phone)) fail(400, 'Nhập đủ 10 chữ số của số di động Việt Nam, hoặc dạng +84 tương đương.');
        $customer=['name'=>txt($d['name']??null,'Họ tên',2,100),'phone'=>$phone,'email'=>email($d['email']??null,false),'address'=>txt($d['address']??null,'Địa chỉ',1,500),'note'=>txt($d['note']??'','Ghi chú',0,1000)];
        $mode = $in['mode'] ?? 'direct';
        if (!in_array($mode, ['direct','cart'], true)) fail(400, 'Cách mua hàng không hợp lệ.');
        $payment=$in['paymentMethod']??null;if(!in_array($payment,['cod','bank'],true))fail(400,'Phương thức thanh toán không hợp lệ.');
        if(!isset($in['items'])||!is_array($in['items'])||!array_is_list($in['items'])||count($in['items'])<1||count($in['items'])>100)fail(400,'Giỏ hàng cần từ 1 đến 100 sản phẩm.');
        if (($in['mode'] ?? null) === 'direct' && count($in['items']) !== 1) fail(400, 'Mua ngay chỉ áp dụng cho một phân loại mỗi lần.');
        $qs=[];foreach($in['items'] as $item){$item=obj($item);$id=txt($item['variantId']??null,'Phân loại',1,100);$q=integer($item['quantity']??null,'Số lượng',1,999);$qs[$id]=($qs[$id]??0)+$q;if($qs[$id]>999)fail(400,'Số lượng tối đa là 999 mỗi phân loại.');}
        if($key!==null&&!preg_match('/^[a-zA-Z0-9_-]{8,100}$/D',$key))fail(400,'Mã yêu cầu không hợp lệ.');
        $key = $key === null ? null : hash('sha256', $buyer['id'].':'.$key);
        $requestHash = hash('sha256', $mode.':'.$this->fingerprint($customer,$qs,$payment));
        if ($key !== null && ($saved = $this->s->one('SELECT * FROM idempotency WHERE `key`=?', [$key]))) {
            if (!hash_equals($requestHash, $saved['request_hash'])) fail(409,'Mã yêu cầu đã dùng cho một đơn hàng khác.');
            return decode($saved['response']);
        }
        $cart = array_column(decode($buyer['cart']), null, 'variantId');
        if ($mode === 'cart') {
            if (count($cart) !== count($qs)) fail(409, 'Giỏ hàng đã thay đổi. Hãy kiểm tra lại giỏ hàng.', ['reason'=>'cart_changed']);
            foreach ($qs as $id=>$quantity) {
                if (($cart[$id]['quantity'] ?? 0) !== $quantity) fail(409, 'Giỏ hàng đã thay đổi. Hãy kiểm tra lại giỏ hàng.', ['reason'=>'cart_changed']);
            }
        }
        $settings=$this->s->settings();if($payment==='bank'&&trim($settings['bankInfo'])==='')fail(400,'Cửa hàng chưa cấu hình thanh toán chuyển khoản.');
        $selected = [];
        foreach ($qs as $id=>$quantity) $selected[] = $mode === 'cart' ? $cart[$id] : ['variantId'=>(string)$id,'quantity'=>$quantity];
        $lines = $this->s->shopLines($selected, $mode === 'cart');
        $issues = array_values(array_filter($lines, static fn($line)=>$line['issue'] !== null));
        if ($issues) {
            // Only expose names of unpublished products to buyers who already have them in their cart.
            $missing = false;
            foreach ($issues as &$line) {
                if ($line['slug']) continue;
                $missing = true;
                if ($mode === 'direct') $line['issue'] = 'missing';
            }
            unset($line);
            fail($missing ? 400 : 409, 'Một số sản phẩm không còn đủ điều kiện đặt hàng.', ['reason'=>'stock_changed','lines'=>$issues]);
        }
        $items=[];$subtotal=0;
        foreach ($lines as $line) {
            $items[] = array_intersect_key($line, array_flip(['variantId','productName','variantName','image','sku','price','quantity']));
            $subtotal += $line['price']*$line['quantity'];
        }
        $shipping=$settings['freeShippingThreshold']>0&&$subtotal>=$settings['freeShippingThreshold']?0:$settings['shippingFee'];
        $total = $subtotal+$shipping;
        $priceChanged = false;
        if (array_key_exists('expectedQuote',$in)) {
            $expected = obj($in['expectedQuote']);
            $prices = $expected['prices'] ?? null;
            if (!is_array($prices) || !array_is_list($prices) || count($prices)!==count($lines)) fail(400, 'Bảng giá đã xác nhận không hợp lệ.');
            $confirmedPrices = [];
            foreach ($prices as $price) {
                $price = obj($price);
                $id = txt($price['variantId'] ?? null, 'Phân loại', 1, 100);
                if (!isset($qs[$id]) || isset($confirmedPrices[$id])) fail(400, 'Bảng giá đã xác nhận không hợp lệ.');
                $confirmedPrices[$id] = integer($price['price'] ?? null, 'Giá đã xác nhận');
            }
            $priceChanged = ($expected['subtotal'] ?? null) !== $subtotal || ($expected['shippingFee'] ?? null) !== $shipping;
            foreach ($lines as $line) if ($confirmedPrices[$line['variantId']] !== $line['price']) $priceChanged = true;
        }
        $totalChanged = array_key_exists('expectedTotal',$in)
            && ((!is_int($in['expectedTotal']) && !is_float($in['expectedTotal'])) || $in['expectedTotal'] != $total);
        if ($priceChanged || $totalChanged) {
            fail(409, 'Giá hoặc phí giao hàng đã thay đổi. Vui lòng xác nhận tổng mới.', [
                'reason'=>'quote_changed','quote'=>['subtotal'=>$subtotal,'shippingFee'=>$shipping,'total'=>$total,'lines'=>$lines],
            ]);
        }
        foreach ($lines as $line) $this->s->setStock($line['variantId'],$line['stock']-$line['quantity']);
        $time=now();$token=token();$o=['id'=>uuid(),'code'=>'FL'.strtoupper(base_convert((string)millis(),10,36)).strtoupper(bin2hex(random_bytes(3))),'customer'=>$customer,'items'=>$items,'subtotal'=>$subtotal,'shippingFee'=>$shipping,'total'=>$subtotal+$shipping,'paymentMethod'=>$payment,'status'=>'pending','paymentStatus'=>'unpaid','createdAt'=>$time,'updatedAt'=>$time];
        $o['customerId'] = $buyer['id'];
        $this->s->saveOrder($o,$token);$response=['order'=>$o,'trackingToken'=>$token];
        if ($mode === 'cart') $this->s->query("UPDATE customers SET cart='[]' WHERE id=?", [$buyer['id']]);
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
