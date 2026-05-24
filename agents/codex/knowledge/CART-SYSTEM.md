# Cart System

## Role

Knowledge companion for the Cart System in ConvexPress. Use this with `.codex/agents/experts/cart-system.md` and `specs/ConvexPress/systems/cart-system/PRD.md`.

## Boundary

Cart System requirements, implementation boundaries, integrations, and operational behavior in ConvexPress.

## Current Architecture Rules

- `ConvexPress-Admin/` owns Convex schema, functions, settings, and admin workflows.
- `ConvexPress-Website/` consumes the admin-owned Convex deployment and renders public/customer flows when applicable.
- Prefer current code over migrated VexCart wording when they conflict.
- Keep feature flags and plugin gates aligned with `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts` and `ConvexPress-Admin/packages/backend/convex/helpers/plugins.ts`.

## Implementation Pointers

ConvexPress-Admin/packages/backend/convex/commerce/cart.ts

## Documentation Maintenance

When this system changes, update the PRD, this knowledge doc, the Codex expert prompt, and the linked Airtable System Expert record together.
