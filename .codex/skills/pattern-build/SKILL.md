---
name: pattern-build
description: Author and install a reusable ConvexPress starter pattern from canonical blocks, validate its portability, and verify editor insertion and template rendering.
---

Locate the repository root. Read `block-kit/CONTRACT.md`, `DATA-API.md`, `references/patterns/project-introduction.json` and the selected pack's `template.json` and `DESIGN.md`. Use the actual canonical specs and generated catalog for field values and versions.

Translate the user's request into a coherent editable section or page using existing blocks. A pattern is authored content, not a new block type or runtime primitive composition. Use bounded nested `children`, unique node IDs, semantic heading order and supported layout intents. Keep labels and destinations useful. Do not ship site-owned media, form, product, author, or other database IDs, including IDs nested in queries. Select those after insertion. Do not fabricate live data or use demo resource IDs to make a pattern pass.

Write a JSON file with `id`, `title`, `description`, `category` and `blocks`. Categories are intro, story, features, collection and contact. The ID is the filename slug without the pack prefix. Review `scripts/blocks/patterns.mjs` for exact portability and canonical validation.

Run `bun run pattern:build --pack <installed-pack> --file <authored-json>` to inspect the normalized plan. Within the user's authorized source-editing task, apply that plan with the same command plus `--write`; no extra permission loop is needed. The tool preserves an existing manifest and registers the pattern convention for a pack's first pattern. It refuses duplicate names, stale trees, site-owned references and concurrent operations. It creates a source artifact, not a saved or published customer page.

Run `bun run sync:blocks:all`, `bun run check:blocks`, and relevant pattern/editor tests. Insert the pattern twice in an authorized native staging editor: verify independent IDs, anchor/link remapping, editing, save and reopen, then inspect rendered desktop/mobile and keyboard behavior under the intended packs. Current executable insertion coverage is `scripts/blocks/build-pattern.test.ts` and Admin `canonical-editor/patterns.test.ts`; these are not a substitute for native/public acceptance.

If interrupted, inspect the pack's `.pattern-build.lock`, pattern file and manifest before retrying; confirm which files were published. Do not remove someone else's lock or overwrite an existing pattern. For editing an existing pattern, preserve its identity and use ordinary source edits with the same validation and acceptance gates.

Report the actual source changes, portable-content decisions and completed acceptance. Do not describe source installation as deployment or claim the separate block-compose/block-promote workflows are implemented.
