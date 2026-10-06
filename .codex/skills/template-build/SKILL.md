---
name: template-build
description: Use when creating a ConvexPress visual template pack, including a token-first pack that inherits unimplemented surfaces from Core.
---

Locate the repository containing both ConvexPress applications. Read
`ConvexPress-Website/template-kit/CONTRACT.md` and `README.md`, the user's brand
brief, and the nearest pack's `DESIGN.md`. A pack owns presentation; site copy,
records, menus, images and canonical page composition remain authored data.

From `ConvexPress-Website`, run:

```sh
bun run create:template --id field-notes --name "Field Notes" --dry-run
bun run create:template --id field-notes --name "Field Notes"
```

Use the user's chosen name. Add `--from <installed-pack>` when they want an
editable clone. Existing destinations are refused. For a disposable trial, the
script exports `createTemplate({ root, id, name, from, dryRun })`; `root` is a
Website-shaped directory, not the pack directory. Keep trial output out of the
installed source tree. Copy Website scripts, the app source/configuration and
`apps/web/package.json`, and provide a separate sibling
`ConvexPress-Admin/apps/web/src/lib/templates` directory. Preserve the SDK/Core
and canonical block paths needed by imports. Sync/check resolve paths relative
to their script file: run the copied scripts, not the originals. Reuse installed
dependencies without copying secrets or environment files.

Set palette, typography and structural defaults in `template.json`; record the
design direction in `DESIGN.md`. The generated home delegates to Core as a
starting point. Implement the requested composition using its actual exported
view-model type and SDK primitives; retain canonical content and action states.
Use `template-add-surface` when adding a named surface. Omitted surfaces inherit
Core through the resolver; listed surfaces must have real implementation files.
Keep authored class names, backend calls and business fixtures out of the pack.

After manifest/surface changes, run `bun run sync:templates` from Website
`apps/web`; review its Website manifests and generated Admin mirror changes.
Then use `template-audit` for static checks, types, SSR and the affected actual
Website states. A token-first pack need not duplicate every Core surface, but
its fallback must preserve the required content and behavior.

Report implemented surfaces, deliberate fallbacks, checks and runtime evidence
separately. Scaffolding does not activate, deploy or publish a site. Use the
session's authorized staging target for preview/activation; keep existing site
settings and content recoverable.
