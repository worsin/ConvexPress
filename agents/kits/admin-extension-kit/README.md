# Extension Kit

This folder is Claude's brain for building and maintaining **extensions**
in the ConvexPress admin app. Read this before writing any code that
adds, modifies, or audits an extension.

## What an extension is in ConvexPress

An extension is a toggleable feature that crosses multiple layers:
backend data + admin UI + capability gating + nav presence, with an
optional Website-side surface. Examples already in the codebase:
`commerce`, `knowledgeBase`, `tickets`, `recipes`, `gallery`,
`membership`, etc.

Extensions are controlled from `/plugins` in admin. When disabled, an
extension's nav sections disappear, its admin routes are guarded, and
its public routes (if any) are blocked.

**Extensions are NOT user-installable plugins** in the WordPress sense.
They are platform-defined units of functionality. The "marketplace" /
"upload a zip" model does not apply.

## Who reads this folder

Claude, when invoked via any `extension:*` skill in `.claude/skills/`.
The user doesn't read or edit this folder directly.

## What lives here

```
extension-kit/
├── README.md           ← you are here
├── ARCHITECTURE.md     ← the 7 layers every extension touches
├── CONTRACTS.md        ← validation rules; what makes an extension "done"
├── DATA-API.md         ← admin-side APIs an extension uses (settings, caps, etc.)
├── WORKFLOW.md         ← end-to-end pipeline for building an extension
├── TROUBLESHOOTING.md  ← failure modes + fixes
└── references/         ← real, annotated example files per layer
    ├── schema.example.ts
    ├── queries.example.ts
    ├── mutations.example.ts
    ├── admin-list-route.example.tsx
    └── registry-entry.example.ts
```

## Reading order for any `extension:*` invocation

1. **`ARCHITECTURE.md`** — the 7 layers of an extension (backend schema,
   queries, mutations, admin routes, plugin registry, nav, capabilities)
   and how they fit together. Read this once per session.

2. **`CONTRACTS.md`** — the validation checklist. Every layer below
   must satisfy its rules for the extension to be considered "done."

3. **`DATA-API.md`** — the verified admin-side APIs an extension
   commonly uses (settings, capabilities, audit log emit, event
   emit, etc.). Includes the wrong-name → correct-name table.

4. **The relevant reference** in `references/` — real working example
   code per layer with annotations explaining *why* each piece exists.

5. **The existing extension registry** at
   `apps/web/src/lib/plugins/registry.ts` — confirm which extensions
   exist now and look at one similar to what you're building (e.g.,
   if building "events", study how `recipes` is registered).

## What you write

The `extension:*` skills generate files across these locations:

```
packages/backend/convex/
├── schema/<ext>.ts                 ← extension's tables
└── <ext>/
    ├── queries.ts                  ← public + admin queries
    ├── mutations.ts                ← writes
    └── internals.ts                ← optional system-to-system fns

apps/web/src/
├── routes/_authenticated/_admin/<ext>/  ← admin UI routes
├── lib/plugins/registry.ts         ← registry entry (MODIFY, don't replace)
└── lib/admin-shell/nav-config.ts   ← nav entry (MODIFY, don't replace)
```

Plus capability + role updates depending on the extension's gating.

## What you don't do

- **Don't create a "plugin marketplace" or "upload extension" feature.**
  That model doesn't exist.
- **Don't add capabilities or roles outside the role/capability system
  expert's domain.** If new capabilities are needed, invoke or defer
  to `/experts:role-capability-system`.
- **Don't generate Website-side routes here.** Extensions can declare
  Website route prefixes (`routePrefixes`), but the actual Website
  templates belong to the design-kit in `ConvexPress-Website/`. Hand
  off via clear notes in your generation report.
- **Don't deploy.** Extensions land as code. Deployment is the Convex
  Deployment Expert's job. Your job ends at "files written + types
  pass."

## When something goes wrong

See `TROUBLESHOOTING.md`. Common cases: registry type union missing
the new id, default-enabled state forgotten, nav entry without
pluginId, missing capability checks on mutations, etc.

## How this kit relates to others

- **design-kit** (in `ConvexPress-Website/`) — Website-side templates.
  When an extension exposes a public surface, hand off to design-kit
  for the templates.
- **Future kits** — see `/.claude/KITS-ROADMAP.md` for the full list
  of agreed-on kits.
