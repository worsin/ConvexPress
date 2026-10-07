# Final desktop evidence and tracker reconciliation — October 6, 2026

E22 is accepted at its screenshot provenance and tracker-gate boundary. Candidate source is `3f952bd8`; the accompanying change isolates a negative test and updates delivery records, with no renderer or product changes.

## Reviewed evidence

The reviewed matrix contains 548 distinct block/pack identities (137 blocks × four packs), covered by 699 overlapping desktop viewport segments. The original JPEG captures and their review records remain in `output/final-evidence-20261006/viewport-manifest.json`. Each selected identity is marked reviewed. This is selected-example desktop evidence, not independent mobile, native, provider or motion acceptance.

The PNG path convention is now satisfied in `ConvexPress-Admin/output/playwright/blocks/<pack>/<namespace>/<block>.png`; tall specimens retain additional segments in adjacent `<block>.segments/` folders. Existing files were backed up under `output/final-tracker-evidence-20261006/previous/`. Conversion changed only image encoding: decoded RGBA pixels matched for all 699 JPEG/PNG pairs; no crop, resize, compositing or generated image was used. Original captures remain intact. Installed file hashes were checked again after conversion.

`output/final-tracker-evidence-20261006/installed-manifest.json` records original and installed hashes, decoded pixel hashes, specification and renderer hashes, identity, viewport geometry, continuous scroll coverage and final-bottom coverage. All 548 current specification/renderer hashes match. The six visual source changes since the original matrix baseline are accounted for by the CSS and final-layout deltas, with replacement reviews in `layout-wrapper-final-20261006.md` and `desktop-matrix-final-20261006.md`; no visual source change is unaccounted for. Rejected earlier captures/contact sheets do not supersede the selected replacement records.

## Gate results and regression repair

- Central renderer suite: 322 passed, 5,542 assertions, 1,148 executed pack/example cases (`renderer-final.log`, `renderer-evidence-final.json`).
- Block tooling suite: 188 passed, 18,140 assertions (`tooling-final.log`).
- Negative/parity gates: seven passed, 38 assertions (`negative-gates-green.log`). The initial run was six pass/one fail because the missing-PNG regression assumed the real workspace had no Events screenshot. It now uses an isolated temporary output tree with the real block test files. The assertion still requires rejection of a Verified claim without a PNG, regardless of real workspace capture completeness.
- Generated drift check passed, including 22 exact canonical field shapes and 25,288 validator source bytes (`generated-drift.log`).
- Final live tracker gate passed: 137 inventory rows, 137 repository specifications, all 133 Verified claims checked (`tracker-live-final.log`). Delivery-status row/header parity passed (`status.log`).

Logs and receipts above are under `output/final-tracker-evidence-20261006/`. No tracker row was promoted by this work. Four provider-dependent rows remain In progress. This closes E22; final artifact integration, external prerequisites and full scoped delivery remain separate requirements.
