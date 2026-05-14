# ConvexPress Admin — Codex Instructions

This is the **admin app** for a ConvexPress site. It owns the Convex
database; the Website app at `../ConvexPress-Website/` is a consumer.

> Codex mirror of `.claude/CLAUDE.md`. The original Claude assets remain
> under `.claude/`; the Codex-facing mirror lives under `.codex/`.

## Building or auditing extensions

This repo ships with an **extension-kit (v2)** at `extension-kit/` and a
matching skill set at `.codex/skills/extension-*` (mirrored from
`.claude/skills/extension-*`). Use them when the user asks to build,
extend, or audit any toggleable feature module.

**v2 contract** (the version of the kit currently active): extensions
are **scanner-discovered, additive-only**. They live in one of two
roots:

- `apps/web/src/extensions/<id>/` + `packages/backend/convex/extensions/<id>/`
  for **official** extensions (tracked, ships with platform)
- `apps/web/src/extensions.local/<id>/` + `packages/backend/convex/extensions.local/<id>/`
  for **user-installed** extensions (gitignored, survives auto-update)

Extensions never modify `schema.ts`, `lib/plugins/registry.ts`, or
`lib/admin-shell/nav-config.ts`. Scanners (Vite `import.meta.glob` on
the frontend + a codegen script on the backend) merge platform v1
entries with v2-discovered ones.

| Skill | When to invoke (description-matched) |
|---|---|
| `extension-build` | "build a new extension for X", "create the Y feature module" |
| `extension-add-feature` | "add bulk delete to events", "extend X with Y" |
| `extension-audit` | "audit the X extension", "verify Y is wired correctly" |

Each skill file is `.codex/skills/<skill-name>/SKILL.md`. Read the
relevant `SKILL.md` in full before acting — the file is the contract.

The kit's reading order: `README.md` → `ARCHITECTURE.md` →
`CONTRACTS.md` → `DATA-API.md` → `WORKFLOW.md` → relevant
`references/*.example.*`.

**Platform v1 extensions** (commerce, kb, recipes, gallery, tickets,
etc.) remain hand-edited in the hub files. They coexist with v2. No
migration is planned in the current scope.

## Hard rules (admin-side specific)

- **You don't deploy Convex.** Deployments are the
  `convex-deployment` expert's job (see `../.codex/agents/experts/convex-deployment.md`).
  Your work ends at "code written + types pass."
- **You don't modify the Role/Capability registry.** That's the
  `role-capability-system` expert's domain
  (`../.codex/agents/experts/role-capability-system.md`).
  Extensions SURFACE new capabilities; the Role expert REGISTERS them.
- **No imports from `@radix-ui/*`.** Use `@base-ui/react`.
- **No hardcoded color literals.** Use CSS variables.
- **Full-page navigation, no modal-based content editors.**
  Confirmation dialogs are the only allowed popup.

## Skill kits in this project

ConvexPress is AI-first; **kits are the architectural unit of work**.
See `../.codex/KITS-ROADMAP.md` (Codex mirror of `../.claude/KITS-ROADMAP.md`)
for the full kit roadmap (existing kits, future agreed-on kits, and the
standard 7-file scaffold every kit follows). Don't reinvent kit
structure.

## Tech stack — quick reference

- TanStack Router + Vite (SPA — behind auth)
- Convex (owned here, not in Website)
- Convex Auth (local JWT)
- Base UI (`@base-ui/react`)
- Tailwind CSS v4
- Bun
- Electron (for desktop packaging at `packages/desktop/`)

## When the user describes a multi-layer feature

If the work touches schema + admin UI + capabilities + nav, it's almost
certainly an extension build (or feature add). Route the work through
`extension-*` skills rather than scattering ad-hoc changes across files.

## Non-Destructive Policy

- Do not delete or rewrite `.claude/` assets as part of Codex usage.
- Extend or mirror into `.codex/` instead.
- Treat the Claude originals as the canonical historical source.
