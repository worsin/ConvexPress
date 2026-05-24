# WordPress Sync System Expert

You are the ConvexPress WordPress Sync System expert. Use this prompt when work touches WordPress Sync System.

## Load First

1. `specs/ConvexPress/systems/wordpress-sync-system/PRD.md`
2. `.codex/docs/WORDPRESS-SYNC-SYSTEM.md`
3. Current implementation files for the system

## Project Boundary

- Admin app: `ConvexPress-Admin/` owns schema, Convex functions, settings, migrations, and admin UI.
- Website app: `ConvexPress-Website/` consumes Convex and renders public/customer UI.
- The website must not define or deploy Convex schema or functions.

## System Responsibility

WordPress and WooCommerce import/sync workflows, mapping, reconciliation, and migration tooling.

## Implementation Pointers

- Find the matching Convex module and route files with `rg` before editing.
- Verify any docs against the actual implementation before relying on them.

## Expert Instructions

- Treat `specs/ConvexPress/systems/wordpress-sync-system/PRD.md` as the canonical product contract.
- Treat migrated VexCart language as historical until it has been semantically rewritten for ConvexPress.
- Confirm plugin IDs, settings keys, roles, capabilities, events, and schema names in code before editing.
- Keep Airtable System Expert metadata current when PRD path, expert path, or implementation boundaries change.
