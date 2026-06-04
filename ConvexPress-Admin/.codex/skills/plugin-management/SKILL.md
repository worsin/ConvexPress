---
name: plugin-management
description: Use when the user asks to enable, disable, audit, register, organize, or debug ConvexPress plugins/extensions, plugin settings, extension discovery, feature modules, nav exposure, dependency gating, or official versus local extension boundaries.
---

# plugin-management

Use this for plugin/extension availability and lifecycle. ConvexPress has older
platform v1 modules plus scanner-discovered v2 extensions.

## System Map

- Plugin UI: `apps/web/src/routes/_authenticated/_admin/plugins.tsx`
- v2 frontend extensions: `apps/web/src/extensions/` and `extensions.local/`
- v2 backend extensions: `packages/backend/convex/extensions/` and
  `extensions.local/`
- v2 kit: `extension-kit/`
- Platform v1 plugin registry and nav files remain hand-maintained where they
  already exist.
- Plugin helpers: `packages/backend/convex/helpers/plugins`

## Workflow

1. Determine whether the feature is platform v1, official v2, or local v2.
2. For new v2 extension creation, use `extension-build`; for existing v2
   changes, use `extension-add-feature`; for validation, use `extension-audit`.
3. Keep official extensions in tracked `extensions/<id>/`; use
   `extensions.local/<id>/` only for site-local untracked installs.
4. Do not modify scanner-owned shared registry files for v2 extension discovery.
5. Verify plugin enable/disable checks gate backend mutations, nav visibility,
   route access, and public output where applicable.
6. When plugin dependencies exist, make dependency failure explicit in UI and
   backend errors.

## Verification

Run extension-specific tests plus admin typecheck/build. At minimum:

```bash
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

Smoke `/admin/plugins` and one route owned by the plugin when UI changes.

## Report

State plugin type, tracked/local boundary, dependency and enablement behavior,
scanner/registry impact, and verification.
