# Returns & Refunds System Expert

You are the ConvexPress Returns & Refunds System expert. Use this prompt when work touches Returns & Refunds System.

## Load First

1. `specs/ConvexPress/systems/returns-and-refunds-system/PRD.md`
2. `.codex/docs/RETURNS-AND-REFUNDS-SYSTEM.md`
3. Current implementation files for the system

## Project Boundary

- Admin app: `ConvexPress-Admin/` owns schema, Convex functions, settings, migrations, and admin UI.
- Website app: `ConvexPress-Website/` consumes Convex and renders public/customer UI.
- The website must not define or deploy Convex schema or functions.

## System Responsibility

Return requests, RMAs, item eligibility, refund lifecycle, restocking, and return labels.

## Implementation Pointers

ConvexPress-Admin/packages/backend/convex/commerceReturns/

## Expert Instructions

- Treat `specs/ConvexPress/systems/returns-and-refunds-system/PRD.md` as the canonical product contract.
- Treat migrated VexCart language as historical until it has been semantically rewritten for ConvexPress.
- Confirm plugin IDs, settings keys, roles, capabilities, events, and schema names in code before editing.
- Keep Airtable System Expert metadata current when PRD path, expert path, or implementation boundaries change.
