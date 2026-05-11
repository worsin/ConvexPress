# ConvexPress Admin — Claude Instructions

This is the **admin app** for a ConvexPress site. It owns the Convex
database; the Website app at `../ConvexPress-Website/` is a consumer.

## Building or auditing extensions

This repo ships with an **extension-kit** at `extension-kit/` and a
matching skill set at `.claude/skills/extension-*`. Use them when the
user asks to build, extend, or audit any toggleable feature module
(commerce, knowledge base, events, recipes, gallery, etc.).

| Skill | When to invoke (auto-routes via skill descriptions) |
|---|---|
| `extension:build` | "build a new extension for X", "create the Y feature module" |
| `extension:add-feature` | "add bulk delete to events", "extend recipes with X" |
| `extension:audit` | "audit the gallery extension", "verify Y is wired correctly" |

The kit's reading order: `README.md` → `ARCHITECTURE.md` →
`CONTRACTS.md` → `DATA-API.md` → relevant `references/*.example.*`.

## Hard rules (admin-side specific)

- **You don't deploy Convex.** Deployments are the
  `/experts:convex-deployment` agent's job. Your work ends at "code
  written + types pass."
- **You don't modify the Role/Capability registry.** That's the
  `/experts:role-capability-system` agent's domain. Extensions
  SURFACE new capabilities; the Role expert REGISTERS them.
- **No imports from `@radix-ui/*`.** Use `@base-ui/react`.
- **No hardcoded color literals.** Use CSS variables.
- **Full-page navigation, no modal-based content editors.**
  Confirmation dialogs are the only allowed popup.

## Skill kits in this project

ConvexPress is AI-first; **kits are the architectural unit of work**.
See `../.claude/KITS-ROADMAP.md` for the full kit roadmap (existing
kits, future agreed-on kits, and the standard 7-file scaffold every
kit follows). Don't reinvent kit structure.

## Tech stack — quick reference

- TanStack Router + Vite (SPA — behind auth)
- Convex (owned here, not in Website)
- Convex Auth (local JWT)
- Base UI (`@base-ui/react`)
- Tailwind CSS v4
- Bun
- Electron (for desktop packaging at `packages/desktop/`)

## When the user describes a multi-layer feature

If the work touches schema + admin UI + capabilities + nav, it's
almost certainly an extension build (or feature add). Route the work
through `extension:*` skills rather than scattering ad-hoc changes
across files.
