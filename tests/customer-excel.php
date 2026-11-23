<?php
declare(strict_types=1);
use Fillico\ProductWorkbook;

function customerApiChecks(string $base, Client $guest, Client $buyer): void {
    check('Buyer signup, role separation and guest restrictions', function () use ($guest,$buyer) {
        ensure($guest->request('/api/customer/cart')['status']===401);
        ensure($guest->request('/api/customer/cart','POST',['action'=>'add','variantId'=>'0','quantity'=>1])['status']===401);
        ensure($guest->request('/api/orders','POST',['items'=>[]])['status']===401);
        $registration = $buyer->request('/api/customer/register','POST',['name'=>'Khách kiểm thử','email'=>'buyer@example.test','password'=>'BuyerTest2026!','role'=>'owner']);
        ensure($registration['status']===201,json_encode($registration));
        ensure(!isset($registration['json']['customer']['role']));
        ensure(str_contains(implode("\n",$registration['headers']),'HttpOnly'));
        ensure($buyer->request('/api/admin/orders')['status']===401);
        ensure($buyer->request('/api/auth/me')['status']===401);
        ensure($buyer->request('/api/customer/me')['json']['customer']['email']==='buyer@example.test');
    });
    check('Buyer carts stay separate and expired identities cannot mutate another cart', function () use ($base,$buyer) {
        $other=new Client($base);
        ensure($other->request('/api/customer/register','POST',['name'=>'Khách số hai','email'=>'second@example.test','password'=>'SecondBuyer2026!'])['status']===201);
        ensure($buyer->request('/api/customer/cart','POST',['action'=>'add','variantId'=>'0','quantity'=>1])['status']===200);
        $id=$buyer->request('/api/customer/me')['json']['customer']['id'];
        ensure($other->request('/api/customer/cart','POST',['action'=>'add','variantId'=>'0','quantity'=>1],['X-Fillico-Buyer'=>$id])['status']===401);
        ensure($other->request('/api/customer/cart')['json']['items']===[]);
        ensure($buyer->request('/api/customer/cart')['json']['items'][0]['variantId']==='0');
        ensure($other->request('/api/customer/logout','POST',['logout'=>true])['status']===200);
        ensure($other->request('/api/customer/cart')['status']===401);
        ensure($other->request('/api/customer/login','POST',['email'=>'second@example.test','password'=>'you shall not pass'])['status']===401);
        ensure($other->request('/api/customer/login','POST',['email'=>'second@example.test','password'=>'SecondBuyer2026!'])['status']===200);
    });
    check('Shipping validation normalizes +84, accepts a short address and isolates retry keys',function () use ($buyer,$base) {
        $other=new Client($base);
        ensure($other->request('/api/customer/login','POST',['email'=>'second@example.test','password'=>'SecondBuyer2026!'])['status']===200);
        $data=['customer'=>['name'=>'Khách số hai','phone'=>'0901234','address'=>'A1'],'items'=>[['variantId'=>'test-variant-2','quantity'=>1]],'paymentMethod'=>'cod','mode'=>'direct','expectedTotal'=>180000];
        $key=['Idempotency-Key'=>'shared-check-key'];
        ensure($other->request('/api/orders','POST',$data,$key)['status']===400);
        $data['customer']['phone']='+84 901-234-567';
        $data['customer']['address']='   ';
        ensure($other->request('/api/orders','POST',$data,$key)['status']===400);
        $data['customer']['address']='A1';
        $first=$other->request('/api/orders','POST',$data,$key);
        $second=$buyer->request('/api/orders','POST',$data,$key);
        ensure($first['status']===201 && $second['status']===201);
        ensure($first['json']['order']['customer']['phone']==='0901234567');
        ensure($first['json']['order']['customerId']!==$second['json']['order']['customerId']);
        ensure($first['json']['order']['id']!==$second['json']['order']['id']);
        ensure($buyer->request('/api/customer/cart')['json']['items'][0]['quantity']===1);
        ensure($other->request('/api/customer/cart')['json']['items']===[]);
        // These test orders are counted by later replay tests as well.
    });
}

function excelChecks(Client $owner, Client $guest, string $target): void {
    check('Direct Excel import accepts the exported template and rejects invalid files without partial writes', function () use ($owner,$guest,$target) {
        $route='/api/admin/products/excel/';
        $type=['Content-Type'=>ProductWorkbook::MIME];
        ensure($guest->request($route.'export')['status']===401);
        $export=$owner->request($route.'export');
        ensure($export['status']===200,$export['text']);
        file_put_contents($target.'/fillico-export.xlsx',$export['text']);
        $original=$owner->request('/api/admin/products')['json']['products'][0];
        $fresh=array_map('array_values',ProductWorkbook::read($export['text']));
        $unchanged=$owner->request($route.'import','POST',null,$type,$export['text']);
        ensure($unchanged['status']===200 && $unchanged['json']['unchangedRows']>0 && $unchanged['json']['productsUpdated']===0);
        $data=$fresh;
        $data['Sản phẩm'][0][2]='Khăn tắm cotton Excel';
        $data['Sản phẩm'][0][4]='  ';
        $data['Phân loại'][0][4]='00321';
        $data['Phân loại'][0][5]=101000;

        $bad=$data;$bad['Phân loại'][0][6]=-5;
        $invalid=$owner->request($route.'import','POST',null,$type,ProductWorkbook::write($bad));
        ensure($invalid['status']===422 && str_contains($invalid['json']['errors'][0],'Cột G'));
        $stillOriginal=$owner->request('/api/admin/products')['json']['products'][0];
        ensure($stillOriginal===$original,'A valid row in a rejected file was applied');

        $import=$owner->request($route.'import','POST',null,$type,ProductWorkbook::write($data));
        ensure($import['status']===200 && $import['json']['productsUpdated']===1 && $import['json']['variantsUpdated']===1,json_encode($import['json']));
        $saved=$owner->request('/api/admin/products')['json']['products'][0];
        ensure($saved['name']==='Khăn tắm cotton Excel' && $saved['variants'][0]['sku']==='00321' && $saved['variants'][0]['price']===101000);
        foreach (['description','image','images','coverSource','coverCrop'] as $field) ensure(($saved[$field]??null)===($original[$field]??null));
        $stale=$owner->request($route.'import','POST',null,$type,$export['text']);
        ensure($stale['status']===422 && str_contains($stale['json']['errors'][0],'đã thay đổi'));
        ensure($owner->request('/api/admin/products')['json']['products'][0]===$saved);

        $fresh=array_map('array_values',ProductWorkbook::read($owner->request($route.'export')['text']));
        $formulaFile=$target.'/fillico-formula.xlsx';
        file_put_contents($formulaFile,ProductWorkbook::write($fresh));
        $zip=new ZipArchive();
        ensure($zip->open($formulaFile)===true);
        $variants=$zip->getFromName('xl/worksheets/sheet2.xml');
        $variants=preg_replace('~<c r="F3".*?</c>~','<c r="F3"><f>1+1</f><v>2</v></c>',$variants,1,$replacements);
        ensure($replacements===1 && $zip->addFromString('xl/worksheets/sheet2.xml',$variants) && $zip->close());
        $formula=$owner->request($route.'import','POST',null,$type,file_get_contents($formulaFile));
        ensure($formula['status']===400 && str_contains($formula['json']['error'],'Phân loại · dòng 3 · cột F'));
        ensure($owner->request($route.'import','POST',null,$type,'not an xlsx file')['status']===400);
        $bad=$fresh;$bad['Phân loại'][]=$bad['Phân loại'][0];
        $duplicate=$owner->request($route.'import','POST',null,$type,ProductWorkbook::write($bad));
        ensure($duplicate['status']===422 && str_contains($duplicate['json']['errors'][0],'bị trùng'));
    });
}
