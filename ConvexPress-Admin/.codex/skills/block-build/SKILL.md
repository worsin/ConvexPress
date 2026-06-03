---
name: block-build
description: Use when creating a new ConvexPress block editor block, adding a portable block type, or making a block show up automatically in the admin block library and public website renderer.
---

# Block Build Skill

Use this skill for new page-builder blocks. The goal is a portable block module
that is discovered automatically, survives platform updates, validates its data,
and renders on the public site.

## Contract

- Build tracked, shareable blocks in `apps/web/src/blocks/<id>/`.
- Use `apps/web/src/blocks.local/<id>/` only for private user-installed blocks
  that should stay local and untracked.
- Name tracked site or platform blocks with a stable namespace such as
  `blocks/story-timeline`, `commerce/product-grid`, or `core/foo` only when the
  block is truly a core platform block.
- When the source inspiration is a specific client/site audit, distill the
  structure into a generic reusable block. Do not put the client/site name,
  acronym, domain, product line, location, or brand-specific vocabulary in the
  tracked folder name, block `name`, exported symbols, title, defaults,
  description, keywords, or AI hints unless the user explicitly asks for a
  private site-specific block in `blocks.local/`.
- Do not register portable blocks by editing the monolithic core registry unless
  you are fixing the registry/discovery system itself. The Vite scanners in both
  apps load `apps/web/src/blocks/*/manifest.tsx` automatically.
- Admin and Website must agree on block `name`, `version`, and schema shape.
- Admin owns editing: metadata, icon, default attrs, Zod schema, and `Editor`.
- Website owns public rendering: matching schema and `Renderer`.
- Attributes must be JSON-serializable content, not presentation controls. The
  active theme/design layer owns visual treatment.
- Keep each block copyable. If multiple blocks import a `_shared` helper, copy
  that helper folder with the block set and document the dependency.

## Required Files

Admin block folder:

- `block.json` with `name`, `title`, `description`, `category`, `keywords`,
  `version`, `supports`, `rendererStatus`, and optional `aiHints`.
- `schema.ts` exporting the Zod attrs schema and inferred attrs type.
- `Editor.tsx` exporting the block editor component.
- `migrations.ts` exporting a no-op migration function until a real version bump
  exists.
- `manifest.tsx` exporting an `AdminBlockDefinition`.

Website block folder:

- `schema.ts` matching the Admin attrs schema.
- `manifest.tsx` exporting a `WebsiteBlockDefinition` with a real renderer.

## Workflow

1. Read the current sample or closest existing block module before coding.
2. Create the Admin and Website folders under tracked `apps/web/src/blocks/`.
3. Add schemas first, then Admin editor, then Website renderer, then manifests.
4. Before verification, scan touched block files for leaked client/site terms,
   for example `rg -i "clientname|client acronym|domain|brand product"`.
   Remove those terms from reusable tracked blocks; move the block to
   `blocks.local/` only when it is intentionally site-private.
5. Run `bun run check:blocks` from `ConvexPress-Admin`; this checks core catalog
   drift and verifies tracked discovered blocks have matching Website renderers.
6. Run focused typechecks for both apps when the change touches TS/TSX:
   `bun run --cwd ConvexPress-Admin/apps/web check-types` and
   `bun run --cwd ConvexPress-Website/apps/web check-types`.
7. If copying to another ConvexPress checkout, copy the whole block folder set
   plus any `_shared` helpers and any discovery/checker fixes.

## Update Safety

Tracked `apps/web/src/blocks/` modules are part of source control and are picked
up by the registry scanner on every build. They are not overwritten by local
install/update flows that ignore `blocks.local`, and they do not disappear from
the inserter unless the files are removed or the block is disabled in settings.
