# Template starter sections

Each installed template may declare `blocks.patterns: "./patterns/*.json"` in its `template.json`. Discovery owns the registry; never add pattern names to application code. Run root `bun run sync:blocks` and `bun run sync:blocks:backend-foundation` after changes.

A pattern file contains `id` (matching its filename), `title`, `description`, `category` (`intro`, `story`, `features`, `collection`, or `contact`) and a nonempty canonical `blocks` tree. Templates support up to64 patterns. The canonical80-node/eight-level/512KiB limits still apply. Use valid block versions and closed layout tokens. Keep content editable; patterns expand to ordinary blocks and do not create a separate persistence model.

Patterns cannot embed site-owned media, form, menu, resource or record references. Users choose these after insertion. A post feed or recent product collection may query its destination site without hardcoded records; disabled plugins/capabilities hide its pattern from the inserter. Synthetic preview content belongs only in BlockDemo adapters.

Insertion deep-clones authored nodes, creates fresh block IDs and page anchors, and remaps links to those anchors. Rich-text link marks and typed link fields are covered. Full-tree validation and current policy run before the draft changes. Saving uses the existing canonical revision and recovery flow; no pattern-specific database mutation is needed.

Spacing belongs to compositions: outer sections own their rhythm; nested marketing blocks usually use `spacing: "none"` to avoid doubled padding. Font, color, grid and motion behavior come from the active template's parts and tokens.

Verification: root `bun test ./scripts/blocks/patterns.test.mjs`; Admin `bun test ./src/components/blocks/canonical-editor/patterns.test.ts ./src/components/blocks/canonical-editor/workspace.test.ts`; Website `bunx playwright test --config playwright.block-demo.config.ts patterns.pw.ts` against the owned BlockDemo runtime. This browser test uses synthetic collection data. Real Electron insertion/edit/save/reload and authorized Website preview are separate acceptance requirements.

The32 initial sections are starting points. The broader handoff requirements for flagship owned treatments, reusable composition authoring/AI actions, executable kit skills, publication and same-content template switching remain distinct work.
