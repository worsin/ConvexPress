# ShipStation Integration

## Role

Knowledge companion for the ShipStation Integration in ConvexPress. Use this with `.codex/agents/experts/shipping-provider-shipstation.md` and `specs/ConvexPress/systems/shipping-provider-shipstation/PRD.md`.

## Boundary

ShipStation Integration requirements, implementation boundaries, integrations, and operational behavior in ConvexPress.

## Current Architecture Rules

- `ConvexPress-Admin/` owns Convex schema, functions, settings, and admin workflows.
- `ConvexPress-Website/` consumes the admin-owned Convex deployment and renders public/customer flows when applicable.
- Prefer current code over migrated VexCart wording when they conflict.
- Keep feature flags and plugin gates aligned with `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts` and `ConvexPress-Admin/packages/backend/convex/helpers/plugins.ts`.

## Implementation Pointers

- Inspect matching Convex module, schema file, admin routes, and website routes before making changes.

## Documentation Maintenance

When this system changes, update the PRD, this knowledge doc, the Codex expert prompt, and the linked Airtable System Expert record together.
