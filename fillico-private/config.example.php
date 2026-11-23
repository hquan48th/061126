<?php
// Copy to config.php inside fillico-private, OUTSIDE public_html.
return [
    'dsn' => 'mysql:host=localhost;port=3306;dbname=YOUR_DATABASE;charset=utf8mb4',
    'db_user' => 'YOUR_DATABASE_USER',
    'db_password' => 'CHANGE_ME',
    'origin' => 'https://fillico.vn', // Exact origin, no trailing slash.
    'uploads_dir' => __DIR__ . '/uploads',
    'allow_http' => false, // Local tests only. Production requires HTTPS.
    // Generate a random secret locally (32+ bytes); remove after installation.
    'setup_token' => '',
];
