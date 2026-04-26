# PRD: Routing System

> **Canonical path:** `specs/ConvexPress/systems/routing-system/PRD.md`
> **Project:** ConvexPress
> **Status:** Canonical scaffold created during the Airtable documentation parity pass on 2026-04-22.
> **Source of truth:** Current implementation, Airtable Systems table, and matching Codex knowledge/expert docs.

## Purpose

Routing System requirements, implementation boundaries, integrations, and operational behavior in ConvexPress.

## Scope

- Define the product and operational contract for Routing System.
- Keep admin-owned Convex backend behavior inside `ConvexPress-Admin/`.
- Keep public/customer rendering inside `ConvexPress-Website/` when this system has a website surface.
- Preserve ConvexPress architecture: admin owns schema/functions; website consumes the admin-owned Convex deployment.

## Primary Implementation Areas

- ConvexPress-Admin/packages/backend/convex/
- ConvexPress-Admin/apps/web/src/
- ConvexPress-Website/apps/web/src/ (if customer-facing)

## Required Documentation Links

- Codex expert: `.codex/agents/experts/routing-system.md`
- Knowledge doc: `.codex/docs/ROUTING-SYSTEM.md`
- Airtable table: ConvexPress / Systems / Routing System

## Acceptance Criteria

- Airtable Systems record links to exactly one current System Expert record.
- System Expert record points to this PRD path under `specs/ConvexPress/systems/`.
- Expert prompt and knowledge doc exist and describe system boundaries.
- Implementation paths listed above are verified when the system is next audited.
- Any VexCart-origin requirements are rewritten in ConvexPress terms before implementation work relies on them.

## Open Follow-Up

This scaffold establishes canonical location and Airtable parity. The next system-specific audit should expand requirements, edge cases, events, permissions, routes, and test expectations from the current implementation.
