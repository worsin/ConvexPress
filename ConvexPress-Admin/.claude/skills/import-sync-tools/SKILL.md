---
name: import-sync-tools
description: Use when the user asks to import, sync, audit, debug, or improve WordPress sync, WooCommerce sync, website import, Airtable sync, API key access for imports, migration/backfill jobs, import findings, sync logs, or external CMS/ecommerce migration tools.
---

# import-sync-tools

Use this for migration and external-system synchronization. These flows are
stateful, often destructive if mishandled, and commonly interact with WordPress,
WooCommerce, Airtable, media, users, commerce, and content.

## System Map

- Admin routes:
  - `apps/web/src/routes/_authenticated/_admin/tools/wordpress-sync/**`
  - `apps/web/src/routes/_authenticated/_admin/tools/website-import/**`
  - `apps/web/src/routes/_authenticated/_admin/api-keys/**`
- Backend domains: `packages/backend/convex/wordpressSync`,
  `websiteImport`, `airtableSync`, API key HTTP handlers, migration/backfill
  helpers.
- Related systems: users/auth, media, posts/pages, taxonomy, commerce orders,
  products, forms, LMS, settings.

## Workflow

1. Identify source and direction: WordPress REST, privileged WordPress plugin,
   WooCommerce, Airtable, website crawl/import, or internal backfill.
2. Confirm credentials are local/secret and not being written to tracked files.
3. Map source identifiers into stable external IDs; preserve idempotency and
   resumability.
4. For user imports, distinguish profile sync from auth/password/Clerk
   provisioning. WordPress REST does not expose password hashes.
5. For content imports, preserve slug, dates, author, taxonomy, media, SEO, and
   revision/history where the source provides it.
6. For commerce imports, reconcile source orders/products with Purchase Core and
   do not duplicate paid records.
7. Always read logs/findings before retrying a failed import.

## Verification

Run backend typecheck plus a dry-run/small-scope import where safe. Never claim a
full migration is complete without count reconciliation.

```bash
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

## Report

List source, mapping strategy, idempotency behavior, count reconciliation,
secrets handling, and remaining manual/provider gaps.
