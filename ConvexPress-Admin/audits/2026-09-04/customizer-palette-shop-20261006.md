# Customizer canonical viewer repair and palette/Shop acceptance — October 6

Opening the on-site Customizer on the canonical Fieldwork Plans page left its body at “Loading document…” while editing was authorized. E102 was reproduced on the retained production Website build `6fc1e5fa`. The canonical body and product-history adapter expected Clerk customer authentication to match Convex authentication, but the active Convex provider belonged to the operator.

## Bounded repair and verification

The handoff HTTP response now carries `viewerSubject` alongside the existing operator user ID. Local operators use their user ID; managed operators use their management-session ID, exactly matching the signed JWT subject. The Website provider exposes only this non-secret binding metadata and installation key. A dedicated public-viewer hook supplies canonical reads and isolated operator product history. Clerk customer hooks, commerce authority, capabilities, document leases and backend authorization are unchanged.

Canonical reads still wait for backend acknowledgement and reject responses for another viewer. Customer sign-in during editing does not switch the public document away from the active operator. Same-subject token renewal preserves the mounted body; subject changes, lost authority and ending editing clear it. Missing subject metadata or a mismatched installation fails closed with an unavailable body. Older backend deployments need the additive handoff metadata update for canonical-body editing.

- The new mounted-body regression failed before the fix because no read started. HTTP regressions failed because the signed subject was absent. Retained logs: `body-red.log`, `http-red.log`.
- Final Website suite: 11 top-level tests passed across four files, including isolated mounted canonical-body and operator-session suites. The body suite exercises real history storage, customer/operator/anonymous bucket isolation, renewal, identity replacement, stale responses, end/revocation, missing metadata and installation mismatch. Backend: 7 handoff tests / 43 assertions passed, including verified local and managed JWT subjects.
- Website strict types and production build passed. The live page served 125 assets byte-identical to the new isolated artifact. A fresh normal handoff rendered the canonical body with editing active; ending editing retained the same public content and removed operator controls.
- Source backend: storage-inclusive private backup; one changed source file across 1,631 preserved files; all 2,388 registered functions and signatures unchanged; strict deployment passed. Installed manifest: `source-source-installed.json`. Target and controller were not deployed. Target's older installed snapshot does not contain this HTTP module; no current-worktree overwrite was attempted there.

## Actual rendered field checks

All checks used the production Website and normal on-site Customizer controls. No values were published or saved as private drafts.

| Scope | Evidence | Result |
| --- | --- | --- |
| All ten palette presets across four packs, light and dark | `palettes-light.json`, `palettes-dark.json` | 20 combinations; all 16 token mappings, appropriate dark fallbacks/Aster overrides, canonical text and light-mode page/action paint accepted |
| Direct color fields | `palette-manual.json` | 64 manual input mappings; actual CSS values and action color, content preservation and reset accepted |
| Palette reset | Same receipts | Exact pack defaults restored; Aster correctly restores its declared Limestone palette rather than empty inputs |
| Catalog at 1600 and 390 pixels | `shop-catalog-desktop.json`, `shop-catalog-phone.json` | 40 combinations: all five supported pack/catalog choices × two densities × two cart modes × two widths; both products retained, no horizontal overflow |
| Density effects | `density-proof.json` | 20 comfortable/dense pairs change the actual grid class and computed gap |
| Product detail at 1600 and 390 pixels | `shop-product.json` | 56 combinations: 14 supported pack/product variants × two cart modes × two widths; actual variant structure, title and $45.00 price retained, no overflow |
| Responsive cart column | Catalog/product receipts | Persistent column appears on desktop; drawer-only removes it; phone never displays a persistent column |
| Shop reset | Catalog/product receipts | Desktop catalog layout/grid class/gap/cart presence restores exactly; product default layout restores for every pack at both widths |

These are field-to-surface checks, not a new purchase, provider or visual-polish acceptance. Cart actions remain disabled for the operator-only preview. Existing customer transaction evidence is separate.

The initial dark-toggle mouse attempt hit the overlaid Customizer; keyboard activation worked. Transient lazy-pack rendering, popup closing and animated grid width were excluded from stable assertions. A test-only cross-realm object comparison and Aster empty-reset expectation were corrected without changing product code. The isolated artifact needed its normal runtime dependency link; a hash-only handoff navigation initially retained the old bundle, so accepted results followed a full reload and asset verification. Editing expiry was observed during the longer Shop run; the last phone catalog matrix used a fresh tab and normal handoff. The final phone screenshot includes the navigation drawer and is not visual-polish evidence; final integration should still exercise overlapping editor/mobile overlays.

## Preservation, cleanup and delivery reconciliation

Exact API before/after comparison passed for all 43 listed pages, all four pack draft queries, the full appearance snapshot, general/reading settings and menu locations. No authored data changed. Operator editing ended, temporary tabs closed, viewport reset, API session revoked (refresh returns 401), and only the owned Website runtime stopped. Seven protected processes remained alive. Private snapshots/backups remain private. No push.

Evidence directory: `output/customizer-palette-shop-20261006/`. `preservation.json`, `cleanup.json`, `artifact-proof.json`, `installed-source-proof.json` carry the machine-readable checks.

Combined with `customizer-global-layout-20261006.md` and its linked typography/chrome/context/history/promotion evidence, this closes the remaining Colors16/preset and Shop4 field mappings in Task 5. It does not close E05 hosted HTTPS/local-network editing, five remaining block acceptance rows, Task 6 demo/motion review, Task 7 actual AI composition or Task 8 final integration. Tracker remains 132 Verified / 5 In progress.
