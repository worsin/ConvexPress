---
name: block-build
description: Use when the user asks to create, scaffold, register, or build a new ConvexPress page block. Triggers on "create a custom block", "add a new block type", "make a pricing-table block", or "teach the page editor a new block". Builds scanner-discovered blocks without editing the core registry, preserving update safety.
---

# block-build

You are creating a new ConvexPress page block. Blocks are the unit of page
composition for the admin Pages editor and AI page generation.

## Contract

- Official blocks go in `apps/web/src/blocks/<block-id>/`.
- Site-specific blocks go in `apps/web/src/blocks.local/<block-id>/`.
- Default to `blocks.local/` unless the user explicitly says this should ship
  with the platform.
- Use `core/<name>` only for platform core blocks. Use `local/<name>` for
  local blocks and `official/<name>` for official add-on blocks.
- Do not add custom blocks directly to `lib/blocks/registry.tsx`.
- Do not remove or rename existing blocks unless the user explicitly asks for a
  migration.
- Existing pages must keep rendering even if the block is later disabled.

## Files

Create:

```text
apps/web/src/blocks[.local]/<block-id>/
  block.json
  schema.ts
  Editor.tsx
  migrations.ts
  manifest.tsx
```

`block.json` is the human and AI-readable metadata:

- `name`
- `title`
- `description`
- `category`
- `keywords`
- `version`
- `supports`
- `aiHints`

`schema.ts` exports a Zod attrs schema and inferred attrs type. Avoid
`z.any()`. Prefer bounded strings, arrays with max sizes, enums, and optional
fields for additive changes.

`Editor.tsx` is admin-only content editing. Use existing admin field patterns,
semantic Tailwind classes, and no design controls unless the attrs genuinely
represent content.

`manifest.tsx` imports metadata, schema, icon, and editor, then exports an
`AdminBlockDefinition<Record<string, unknown>>` as `definition` and default.

## Workflow

1. Read `../docs/BLOCK-SYSTEM.md`, `../docs/BLOCK-CONTRACT.md`,
   `../docs/BLOCK-MIGRATIONS.md`, `../docs/BLOCK-AI-GENERATION.md`,
   `apps/web/src/lib/blocks/types.ts`, and
   `apps/web/src/lib/blocks/registry.tsx`.
2. Pick official vs local scope.
3. Confirm the block name is unique with `rg "name: \"<namespace>/<name>\""`.
4. Create the block folder and files.
5. Keep defaults valid by parsing them through the Zod schema.
6. Add or explicitly mark Website rendering status. For production blocks,
   create the matching Website renderer in `../ConvexPress-Website/`.
7. Run `bun run check-types` from `ConvexPress-Admin/`.

## Report

List files created, the block name, source scope, attrs schema fields, AI hints,
Website rendering status, and typecheck status.
