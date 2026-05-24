---
name: block-audit
description: Use when the user asks to audit, verify, review, or inspect ConvexPress page blocks or the block registry. Triggers on "audit the block system", "check this block", "verify custom blocks are update-safe", or "why is this block not available".
---

# block-audit

You are auditing the ConvexPress block system or one block. This skill is
read-only unless the user separately asks you to fix findings.

## Checks

- Read `../docs/BLOCK-SYSTEM.md`, `../docs/BLOCK-CONTRACT.md`, and
  `../docs/BLOCK-MIGRATIONS.md` first.
- The block is registered by scanner (`blocks/` or `blocks.local/`) or is a
  deliberate core block in `lib/blocks/registry.tsx`.
- Local blocks live under `apps/web/src/blocks.local/` and use `local/<name>`.
- Official add-on blocks live under `apps/web/src/blocks/` and do not patch the
  core registry.
- `manifest.tsx` exports a valid `AdminBlockDefinition`.
- `block.json` metadata matches the manifest.
- Schema has no unbounded `any` and defaults parse successfully.
- Editor uses existing admin UI patterns, no Radix imports, no hardcoded color
  literals, and no unrelated design controls.
- Version changes have migrations.
- Website rendering exists or the report clearly flags it as missing.
- Core blocks duplicated in `packages/backend/convex/blocks/aiPromptBuilder.ts`
  are in sync with frontend definitions.
- Disabled block settings hide blocks from inserters and AI generation without
  breaking existing saved page content.

## Report

Return findings first, ordered by severity, with file paths and line numbers.
Then list open questions, compatibility risks, and recommended fixes.
