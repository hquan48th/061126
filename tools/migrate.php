<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$private = dirname(__DIR__).'/fillico-private';
require $private.'/src/bootstrap.php';

try {
    $config = \Fillico\config($private);
    $store = new \Fillico\Store($config);
    $database = $store->query('SELECT DATABASE()')->fetchColumn();
    $version = (int)$store->query('SELECT MAX(version) FROM schema_migrations')->fetchColumn();
    if ($version < 1) throw new RuntimeException('Import 001_initial.sql trước khi chạy nâng cấp.');
    if ($version < 2) {
        $store->db->exec(file_get_contents($private.'/migrations/002_customer_accounts.sql'));
    }
    if ($version < 3) {
        $store->db->exec(file_get_contents($private.'/migrations/003_customer_orders.sql'));
    }
    $checks = \Fillico\databaseChecks($store);
    if (in_array(false, $checks, true)) throw new RuntimeException('Cơ sở dữ liệu chưa đạt kiểm tra schema sau khi nâng cấp.');
    echo "Cơ sở dữ liệu {$database} đã sẵn sàng.", PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, "Không nâng cấp được. Kiểm tra cấu hình, quyền CREATE TABLE và các migration đã nhập.\n");
    exit(1);
}
