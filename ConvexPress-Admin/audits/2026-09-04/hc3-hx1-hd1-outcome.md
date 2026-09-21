# HC3 / HX1 / HD1 outcome

All changes local in `codex/convexpress-hardening`; no provider/browser operations, commit or push.

## HC3 — complete reference blocks

Installed `reference/field-guide` and `events/upcoming` under matching Admin/Website `apps/web/src/blocks/` folders. Discovery requires no new core registry entry. Field Guide demonstrates text, multiline text, bounded number/range, boolean, enum/color/font tokens, MediaField selection and alt text, nullable override, nested link object and bounded repeater. Every editor field has a renderer behavior. URL validation rejects active schemes; theme tokens and escaped React text are used throughout.

Upcoming Events persists only display settings and consumes the typed public Events query. It skips reads when disabled; renders loading/empty/cancelled/current DTO states; and links actual Events detail records. Root can insert `{name:"events/upcoming",version:1,attrs:{heading:"Upcoming experiences",intro:"",count:3,showDescription:true,emptyText:"New dates are on the way."}}` inside a valid block envelope with a unique id.

`block-kit/references/README.md` documents controls, contracts and the live data boundary. Updated root and agent-kit workflow/contracts now describe actual manifest discovery and the removal of legacy layout/lock envelope fields.

Evidence: four block schema/render/parity tests pass (19 assertions). `check:blocks`: 38 core +15 official blocks. The renderer tests cover loaded, loading, empty, cancellation, escaped authored text, portable serialization, unsafe links, bounds and null/empty distinctions. Actual editor MediaField interaction and live page reactivity remain root staging acceptance.

## HX1 — reserved page route protection

Shared pure `helpers/pageRoutePolicy.ts` matches the actual Website route patterns, including dynamic segments, splats and the configured dashboard namespace. A Website source-contract test compares the full route tree, preventing silent route-policy drift.

Admin SlugEditor shows a live collision warning, handles parent paths and links conflicting legacy records through their working `/page/...` address. It does not rename the user's input. Backend create/update and REST create/update reject reserved candidates before slug suffix generation; parent and reorder mutations validate moved subtrees, including a descendant colliding with a nested custom dashboard. Content-only edits and unchanged legacy paths remain allowed. No publishing behavior was changed.

Evidence: seven real-handler/policy tests pass (19 assertions), plus the route-tree parity assertion. Original create and rename regressions were red (writes succeeded), then green. Tests cover reserved duplicate input without silent suffix, configured dashboard, unchanged legacy edit, recursive move rollback, REST create, setParent and drag reorder.

The page guard uses ordinary mutation transactions and reports `RESERVED_PAGE_ROUTE`. It does not migrate or delete existing colliding pages. Root should verify the warning with a legacy `/events` page, creation with `/products`, a safe `/our-story` page and parent selection in the real editor.

## HD1 — site-build orchestration skill

Added `ConvexPress-Website/.codex/skills/site-build/SKILL.md` and `references/WORKFLOW.md`. The runbook composes template/extension/block kits; verifies exact per-site/staging/live database identity; creates a content/route and evidence plan; authors through current Admin contracts with resumable IDs; applies reserved route and version conflict policy; exercises actual plugin workflows; and separates static, staging and live acceptance. Historical author-site driver functions are cited as reference, with obsolete selectors and fixture execution explicitly identified.

This is a developer workflow, not an unexecuted claim of site creation. Root owns the actual Aster House cloud run.

## Integration checks

Website source suite:490 pass,1199 assertions,33 files. Combined content/publishing/reserved-route suite before the final extra reparent case:59 pass,489 assertions; added reparent case passes independently. Admin and Website TypeScript passed; backend `tsc --noEmit -p convex/tsconfig.json` passed after replacing ES2022 `.at` with compatible indexing. Website lint, template checks4/89 and diff-check passed. Compact API contract activation follows this checkpoint and may expose separate caller corrections; D01 owns that next phase.
