# Historical inventory fixtures

These immutable exports preserve the original block inventory used by migration and tracker regressions. They are test/planning inputs, not current MagicTables status or production acceptance. Live tracking still uses the explicit tracker CLI. Source copies originally lived under ignored local `ConvexPress-Admin/output/blocks-tracker/`; committing them here makes clean-checkout tests reproducible.

- `inventory-2026-09-05.json`: historical 2026-09-05 export, 136 rows; source SHA-256 `f77d835a0f7e52719992f357893ad6952ea07be63fc15d2c4b2c63f5dc6d908b`.
- `inventory-2026-09-16.json`: historical 2026-09-16 export, 137 rows; source SHA-256 `d9812e7943822880ab56f503642a28dc15675bcfef7d0675d69258a9d1aac768`.
