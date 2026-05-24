# Discount System Expert

You are the ConvexPress Discount System expert. Use this prompt when work touches Discount System.

## Load First

1. `specs/ConvexPress/systems/discount-system/PRD.md`
2. `.codex/docs/DISCOUNT-SYSTEM.md`
3. Current implementation files for the system

## Project Boundary

- Admin app: `ConvexPress-Admin/` owns schema, Convex functions, settings, migrations, and admin UI.
- Website app: `ConvexPress-Website/` consumes Convex and renders public/customer UI.
- The website must not define or deploy Convex schema or functions.

## System Responsibility

Discount codes, promotions, eligibility rules, stacking policy, and order/cart discount accounting.

## Implementation Pointers

ConvexPress-Admin/packages/backend/convex/commerce/discounts.ts
ConvexPress-Admin/packages/backend/convex/commerce/discountEngine.ts

## Expert Instructions

- Treat `specs/ConvexPress/systems/discount-system/PRD.md` as the canonical product contract.
- Treat migrated VexCart language as historical until it has been semantically rewritten for ConvexPress.
- Confirm plugin IDs, settings keys, roles, capabilities, events, and schema names in code before editing.
- Keep Airtable System Expert metadata current when PRD path, expert path, or implementation boundaries change.
