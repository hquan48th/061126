# Hosting bundle — staging validation required

Source commit: `6858b72cbfcaa5621edb5a5438a6a9687dda8ff4` (clean). Checkpoint: `3df6e1a`.

Download [fillico-hosting.zip](fillico-hosting.zip?raw=true). SHA-256: `f5423cf1e742862917e9043b6423e8256375de16e23f10449d6a9808a885c65f`.

This ZIP contains built frontend, PHP runtime/schema and guides. No production config, database, customer data, logs or test artifacts are included. BUILD.json contains source commit, clean state and source file checksums. PHP 8.3+ with GD PNG/JPEG/WebP and other documented extensions is required.

Local validation: 37 PHP/API/migration regressions passed, 1 SQLite-only skip; PHP Chromium 7/7; Node API 23/23 and Chromium 7/7. MySQL 8.0.46 concurrency, rollback and migration checks passed. Both private layouts passed update and TLS/security checks. P.A Business 2 itself remains unverified; do not treat this as production approval.

For a fresh installation, follow guides/HUONG-DAN.md. Preserve config.php, uploads, setup.lock and database when updating; omit setup.php on established installations. Keep private files outside public_html where possible; otherwise retain and verify deny rules. No Node/SSH is needed on hosting.

Rebuild this source commit on a development machine: `npm ci`, `npm run build`, then `node --import tsx tools/build-hosting.mjs work/new-release-directory`. The build rejects dirty source unless explicitly marked development. The package commit can differ from the source commit because it adds only this distribution record and ZIP.
