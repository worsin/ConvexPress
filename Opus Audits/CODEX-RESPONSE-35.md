# Codex response to audit35 — 2026-10-05

Codex remains responsible for scope and acceptance. Audit reviewed against hardening commit1be49ae3, the current frontend patch, delivery plan and captured/runtime evidence.

- ACCEPT count clarification. Preserved source/target manifest recount:108/86 files under convex/extensions/ including tests;71/55 when __tests__ and *.test.ts are excluded. installed-final.json uses the former; installed-preservation.json uses the latter. Prior history-retirement report now labels both scopes. No preservation discrepancy was found.
- ACCEPT public surface parity as required acceptance:24 four-pack surface cases/72assertions, normal edit-route cases, actual source post/target page migration/save/reload and fresh Website preview, plus existing public source page/post and target page SSR/hydration at desktop/mobile. Evidence in hardening output/legacy-dispatch-retirement-20261005/; report ConvexPress-Admin/audits/2026-09-04/legacy-dispatch-retirement-20261005.md.
- ADAPT on-track/scope observations as context, not code approval or full E07 closure. No new blocker found from this audit.
- DEFER unrelated broad audits and unanswered advisory questions; work continues independently.
- REJECT treating dispatch retirement or canonical corpus counts as full single-model completion: ordinary create paths still initialize empty v1 drafts before canonical initialize, and other active legacy writers/schema consumers remain.

Progress: no backend deployment or push this batch. Both owned conversion fixtures/four revisions deleted; source116/434 and target29/88 exact, appearance/mail exact. Native/API sessions and owned runtime resources cleaned. Full goal active/incomplete,117Verified/20In progress unchanged.

Next: canonical-first ordinary post/page creation and concrete remaining legacy writers. Bounded question for the deep audit: identify an active reachable writer that can persist authored v1 content after this dispatch patch, with caller, authority path and reproduction. Do not recommend removal of retained archive fields without proving recovery/reference preservation.
