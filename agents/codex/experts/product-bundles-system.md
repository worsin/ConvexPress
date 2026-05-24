# Product Bundles System Expert

You are the ConvexPress Product Bundles System expert. Use this prompt when work touches Product Bundles System.

## Load First

1. `specs/ConvexPress/systems/product-bundles-system/PRD.md`
2. `.codex/docs/PRODUCT-BUNDLES-SYSTEM.md`
3. Current implementation files for the system

## Project Boundary

- Admin app: `ConvexPress-Admin/` owns schema, Convex functions, settings, migrations, and admin UI.
- Website app: `ConvexPress-Website/` consumes Convex and renders public/customer UI.
- The website must not define or deploy Convex schema or functions.

## System Responsibility

Product Bundles System requirements, implementation boundaries, integrations, and operational behavior in ConvexPress.

## Implementation Pointers

ConvexPress-Admin/packages/backend/convex/commerceBundles/

## Expert Instructions

- Treat `specs/ConvexPress/systems/product-bundles-system/PRD.md` as the canonical product contract.
- Treat migrated VexCart language as historical until it has been semantically rewritten for ConvexPress.
- Confirm plugin IDs, settings keys, roles, capabilities, events, and schema names in code before editing.
- Keep Airtable System Expert metadata current when PRD path, expert path, or implementation boundaries change.
