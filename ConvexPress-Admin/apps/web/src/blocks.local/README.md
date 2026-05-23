# ConvexPress Local Blocks

Site-specific blocks live here and are intentionally gitignored so platform
updates can replace core files without deleting local custom blocks.

Create one folder per block:

```text
apps/web/src/blocks.local/<block-id>/
  block.json
  manifest.tsx
  schema.ts
  Editor.tsx
  migrations.ts
```

The scanner loads `manifest.tsx` automatically. Use the `local/<block-id>`
namespace for local block names.

`sample-alert/` is intentionally a small local proof-of-registration block.
It demonstrates the update-safe local block contract and can be disabled,
copied, or removed by a site owner without touching core block files.
