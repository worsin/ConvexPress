---
name: block-add-feature
description: Use when the user asks to extend, modify, migrate, or improve an existing ConvexPress page block. Triggers on "add a field to the hero block", "make this block support images", "change the testimonial block", or "upgrade a custom block".
---

# block-add-feature

You are extending an existing ConvexPress block without breaking existing
pages.

## Rules

- Read the block's manifest, schema, editor, migrations, and Website renderer
  before editing.
- Preserve existing attrs. New fields should usually be optional or have
  defaults.
- If the attrs shape changes, bump the block version and add a migration in the
  block's `migrations.ts`.
- Do not rename attrs unless you migrate old content.
- Do not move local blocks into core files.
- Do not edit `lib/blocks/registry.tsx` for local or official add-on blocks.
- Keep the admin editor content-focused; visual presentation belongs to the
  Website renderer/design skill.

## Workflow

1. Read `../docs/BLOCK-CONTRACT.md` and `../docs/BLOCK-MIGRATIONS.md`.
2. Locate the block by name in `registry.tsx`, `blocks/`, or `blocks.local/`.
3. Identify every layer touched:
   - metadata / AI hints
   - attrs schema
   - admin editor
   - migrations
   - Website renderer
   - AI backend catalog if this is still a core block duplicated there
4. Patch only the block's own files unless it is a true core block.
5. For core blocks, keep frontend registry and backend
   `convex/blocks/aiPromptBuilder.ts` in sync.
6. Run `bun run check-types` from `ConvexPress-Admin/`.

## Report

List changed files, version/migration decisions, compatibility notes, Website
renderer status, and verification result.
