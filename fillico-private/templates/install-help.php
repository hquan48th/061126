<!doctype html>
<html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cài đặt Fillico</title><link rel="stylesheet" href="/assets/shop.css">
<main class="container page-main narrow"><div class="page-title"><h1>Cài đặt Fillico PHP</h1>
<p>Tạo database MySQL/MariaDB và nhập lần lượt <code>001_initial.sql</code>, <code>002_customer_accounts.sql</code> và <code>003_customer_orders.sql</code> trong <code>fillico-private/migrations/</code>.</p>
<p>Sao chép <code>fillico-private/config.example.php</code> thành <code>config.php</code>, điền database, origin và setup_token ngẫu nhiên tối thiểu 43 ký tự.</p>
<p>Local: origin phải khớp địa chỉ đang mở, ví dụ <code>http://127.0.0.1:8000</code>, và <code>allow_http = true</code>.</p>
<p>Hosting: đặt origin HTTPS của tên miền và <code>allow_http = false</code>.</p>
<a class="btn btn-primary" href="/setup.php">Mở trình cài đặt</a></div></main></html>
