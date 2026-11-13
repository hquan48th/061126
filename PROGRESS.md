# PHP/MySQL migration progress

Repository: hquan48th/061126. Branch: migration/php-mysql. Node baseline: 3d95cb782ed7843da043573e8dbd6b890667d860. Reviewed migration checkpoint: 3df6e1a.

Status: local validation passed; awaiting P.A Business 2 staging verification. NOT approved for production. No merge, DNS change or production upload authorized in this work.

- Preserved reviewed PHP checkout and created checkpoint before audit fixes.
- Pending checkout uses per-tab sessionStorage, exact replay and a 30-minute customer-data retention limit. Uncertain requests retain their key; after expiry the customer must check the old order before explicitly starting a new attempt. Closing the tab ends normal session storage lifetime; browser session restoration may retain it until the next expiry check.
- Both private directory layouts resolve from retained config placement. Missing/ambiguous configuration and bootstrap errors fail closed without displaying paths.
- Variant ID "0" remains stable, including migrated pending orders.
- One credential policy rejects surrounding Unicode whitespace at login, creation, setup, change and offline reset. Legacy scrypt remains disabled; old sessions are not imported.
- Upload validation checks PNG completeness/checksums and decodes PNG/JPEG/WebP with GD after pixel and memory checks.
- HEAD dispatches GET without a response body.
- Release build requires a clean commit by default; development dirty builds require --allow-dirty and contain source state and hashes.
- Logout tests wait for the logout result/UI before navigating, rather than relying on increased timeouts.

No .local data, production images/configuration or customer databases are part of commits. Only synthetic fixture credentials appear in test tools. Generated bundles, logs and test artifacts remain ignored under work/.

## Validation results

- Node/SQLite API: 23/23 passed; Chromium: 7/7 passed.
- PHP/MariaDB API + migration + regressions: 37 passed, 1 SQLite-only test skipped; no failures. Chromium: 7/7 passed.
- TLS cookies, private path protections, controller/bootstrap failure behavior and whole-code updates in both layouts: passed.
- Additional installer NBSP rejection: passed.
- MySQL 8.0.46: 16 concurrent stock buyers, 16 idempotent retries, 16 cancellations, transaction rollback and nine-table migration content/count checks: passed.
- PHP runtime 8.3.36 / MariaDB 10.11.19 / Apache 2.4.69; GD supports PNG/JPEG/WebP. TypeScript/Vite build passed.
- Dirty release build is rejected before writing its destination. Final release will be built from the committed clean source and supplied with checksums.
- Early runs failed on a corrupt legacy PNG fixture, a zero-ID ordering assumption in the migration test, and OPcache masking a removed bootstrap in fault injection. Fixtures/assertions were corrected; the controller explicitly verifies bootstrap availability. Final runs above passed.

Remaining: P.A account access/runtime verification, production-data migration rehearsal, high-volume load and panel import/update limits. No P.A production check, deployment or main merge was performed.
