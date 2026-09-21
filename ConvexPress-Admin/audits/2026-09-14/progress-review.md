# ConvexPress progress review — September 14, 2026

## Latest implementation update

After the initial review, Gallery Album, Related Content and Archive List were implemented. Current inventory is **123/136 renderers, 13 missing**. Archive List now has real site-time-zone month/year destinations, native save/reopen and linked-page proof; see `output/archive-list-20260914/checks.json`. Related Content passed native editor save/reopen and actual linked-page rendering, isolated deployments, and four-pack desktop/mobile checks; complete block acceptance remains open. See `output/related-content-20260914/checks.json`. The counts below describe the review's original checkpoint.

## Verdict and scope correction

The editor block library is not finished. Direct filesystem inspection today found **136 canonical block definitions, 120 library renderers, and 16 missing renderers**. Live readback of the Standalone MagicTables Blocks table found **136 In progress rows; all complete-block Tests and Screenshots gates remain false**. A renderer existing is implementation evidence, not proof of a finished editor workflow or polished treatment in every template.

The ledger's historical “98 broader accepted” figure describes earlier partial acceptance coverage. It must not be presented as 98 fully verified blocks. Existing tests and screenshots remain useful evidence, but the complete per-block acceptance matrix is unfinished.

Recent work has concentrated too heavily on KB infrastructure while the remaining block library and template polish have waited. That work repaired real authorization, indexing, scheduling, and recovery defects, but the sequencing drifted from the user's immediate block deliverable. No new blocks were completed during the latest KB recovery and indexing-control sequence. The user's September 14 clarification puts completion of the editor blocks back first.

This review reads existing evidence and refreshes inventory and tracker state. It does not rerun every historical test, reverify every live deployment, or certify production readiness.

## Blocks remaining

| Group | Missing library renderers |
| --- | --- |
| Commerce (5) | bundle-offer, download-library, product-compare, variant-picker-teaser, wishlist |
| Core (10) | archive-list, event-rsvp, language-switcher, lead-magnet, related-content, reviews, search-results, social-feed, synced, ugc-grid |
| Gallery (1) | album |

All 16 have block definitions. They still need finished rendering and any required editor, resolver, permission, interaction, and persistence behavior. Stub data or an attractive screenshot alone will not close them.

Four template pack directories exist: **Core, Journal, Depot, Aster House**. BlockDemo exists, but neither that fact nor the number of packs proves every block has a polished treatment in each pack. Complete desktop/mobile, keyboard, reduced-motion, and interaction verification remains necessary. Smooth GPU-friendly motion and clean gradients remain explicit quality requirements; no universal animation-performance pass has been established.

## What has been built and exercised

| Area | Evidence already recorded | What remains |
| --- | --- | --- |
| Block foundation and editor | Canonical JSON specifications, generated contracts and editor metadata, SDK primitives, native editor integration, actual Website preview; selected native create/save/reopen/revision/preview flows exercised | Remaining 16 renderers; full editor and template matrix; remaining migration and composition edge cases |
| Templates and SDK | Four packs; scaffold/check tooling; reference field guide and Events plugin; selected live reactive content and four-pack production rendering checks | All-block treatments and screenshots, default patterns, complete customer dashboard and Customizer acceptance |
| Separate business/site/cloud environments | Aster Studio → Aster House created in native Admin; separate personal Convex production and staging databases deployed and checked | End-to-end same-app client onboarding and isolation across real customer sessions and lifecycle changes |
| Cloudflare publishing | Aster staging published through Electron to a Workers subdomain; rendered acceptance; actual OAuth renewal followed by successful publication recorded | Custom-domain workflow, production launch, broader failure/recovery and clean-machine acceptance |
| Vercel | Publishing implementation and local SSR artifact checks recorded | Live provider publication and account-to-domain acceptance |
| Commerce | Payment/retry/refund/order/coupon/subscription fixes and regression evidence; real cloud manual-invoice checkout, shipping totals and inventory changes | Actual payment-provider lifecycle acceptance, digital delivery and remaining customer flows |
| Content/recovery | Canonical revisions and selected publication/promotion flows exercised; same-environment 153 MB backup/restore with file hashes recorded | Complete migration/promotion/rollback and maximum-capacity, installer and fleet recovery acceptance |
| Security/isolation | Protected content, scoped authority, permission invalidation, native IPC and session recovery fixes; multiple focused live denial/revocation tests | Full two-client Electron isolation/revocation matrix and remaining public/admin routes |
| Performance/UI | Reproduced desktop output-pipe freeze repaired; hydration interaction fixes; one measured initial-page transfer reduced from 824,366 to 652,862 compressed bytes | Whole-app interaction and performance acceptance; remaining mobile/header and media warning findings |
| KB | Durable category and indexing jobs, scoped provider access, scheduling, native start/status/resume; real same-job recovery evidence | Remaining KB scale/provider/editor cases. Latest unknown-ack reconciliation is implemented and deployed, but its real dropped-ack acceptance has not run |

Historical evidence lives in the September 4 outcome documents and the item-level implementation ledger. Later ledger entries supersede earlier “pending” statements only for the exact cases they prove.

## Original 24-item audit mapping

No item below is being newly certified complete by this review. “Implemented” refers to recorded source fixes and focused checks; “partial live proof” applies only to the exercised cases.

| ID | Original issue | Current evidence and remaining acceptance |
| --- | --- | --- |
| A01 | Protected fields in public content | Fixes and selected live access checks; complete public response surface coverage remains |
| A02 | Customer login granting editorial authority | Authority separation implemented; complete real-client login and role lifecycle matrix remains |
| A03 | Alternate publication channels bypassing protection | Feed/search/archive protection repaired and selected cases exercised; full channel matrix remains |
| A04 | Disabled parent still permitting site access | Parent consistency and descendant revocation implemented; multi-client runtime matrix remains |
| A05 | Previous permission holder not invalidated | Old/new subject invalidation implemented; full live reassignment acceptance remains |
| A06 | Permission limits dropping denies | Fail-closed overflow and bounded resolver checks; fleet-scale acceptance remains |
| A07 | Packaged desktop trusting development origins | Sender/origin guards and regression checks; real installer acceptance remains |
| A08 | Permission status changes bypassing owner protection | Owner protection implemented and tested; full live role/status matrix remains |
| B01 | Failed payment creation trapping checkout | Retry and local order/payment handling repaired; live payment provider failure acceptance remains |
| B02 | Pending refund disagreement | Reconciliation and reordered-event tests; live provider acceptance remains |
| B03 | Bulk orders bypassing lifecycle effects | Unified transition handling and tests; full real order/fulfillment matrix remains |
| B04 | Customer coupon restrictions bypassed | Server-side identity/restriction enforcement and tests; broader live coupon acceptance remains |
| B05 | Downgrade billed at old price | Renewal boundary changes tested; real provider cycle acceptance remains |
| B06 | Rescheduled publication leaving old job active | Scheduling fixes and selected actual publication checks; complete integration coverage remains |
| B07 | Block content missing from revisions | Canonical recovery and selected native restore/undo evidence; complete content/migration/revision matrix remains |
| B08 | Session write failure poisoning logout | Recoverable write queue and tests; complete native storage failure/logout acceptance remains |
| B09 | Free-shipping coupon not removing shipping | Separate shipping benefit implemented and tested; full live coupon checkout acceptance remains |
| C01 | Provider and domain provisioning missing | Cloudflare subdomain publishing and OAuth renewal exercised; Vercel and custom domains remain |
| C02 | Packaged deployment needing source checkout | Embedded payload/runtime exercised from unrelated directory with empty PATH; actual installer and supported-platform provisioning remain |
| C03 | Process-local installation state | Durable provisioning and process/IPC tests; full native restart/failure recovery remains |
| C04 | Small backup/restore ceiling | Recorded 153 MB same-environment restore with six 32 MiB file hashes; maximum capacity and packaged/fleet failure acceptance remain |
| C05 | Scheduled backups, retention, fleet alerts | Implementation and focused checks; complete scheduled fleet/retention/alert acceptance remains |
| D01 | Weak frontend/backend contracts | Generated typed contracts and compiler checks; latest recorded inventory 2,128 functions / 2,601 DTOs, with 404 existing unknown boundaries still disclosed |
| D02 | CI omitting unit suites | Workflow and offline binding work recorded; final integrated CI acceptance remains |

## Claude handoff review

The implementation follows the central contract: blocks define data, templates own rendering, and native Admin previews the actual Website. The foundational work, SDK, four packs, reference plugin, and selected native workflows are substantial progress.

Still open: all-block library completion and pack screenshots; complete signed-in dashboard coverage under every pack; Customizer publish/context/preset/undo/conflict/staging behavior across the full matrix; safe legacy migration and eventual removal after receipts; complete site-build orchestration acceptance. The handoff is not finished merely because source modules exist.

## Immediate execution order

1. Preserve the current KB checkpoint and clearly label its unrun dropped-ack acceptance. Do not let the remaining KB backlog consume the next block-development phase.
2. Finish the 16 remaining blocks in bounded groups, with real editor and data behavior. Keep MagicTables notes tied to exact evidence and do not mark complete-block gates prematurely.
3. Complete the organized BlockDemo and verify every block under Core, Journal, Depot and Aster House: desktop/mobile, keyboard, empty/error/populated states, motion, and editor save/reopen/preview.
4. Finish simple default-template styling and patterns, plus the remaining editor/Customizer polish revealed by the matrix.
5. Resume the production release gates: client isolation, hosting/domain flows, clean-machine installer/provisioning, commerce/provider acceptance, backup/recovery/fleet operations, remaining KB defects, and integrated CI.

Work remains isolated in `/Users/worsin/.codex/worktrees/convexpress-hardening` on `codex/convexpress-hardening`. The original checkout is preserved. No commits or pushes were made for this review. The production-readiness goal remains active.

## Evidence consulted

- `specs/handoffs/HANDOFF-ASTRA-2026-09-04.md`
- `specs/handoffs/HANDOFF-ASTRA-BLOCKS-2026-09-05.md`
- `ConvexPress-Admin/audits/2026-09-04/astra-audit.md`
- `ConvexPress-Admin/audits/2026-09-04/implementation-ledger.md`
- September 4 outcome documents for auth/runtime, commerce, packaged provisioning, Vercel publishing, Aster cloud acceptance, BlockDemo and native canonical editor integration
- `output/course-blocks-20260911/next-work.md`
- `output/kb-reconciliation-20260911/fleet-kb-reconciliation-deployment.json`
- September 14 filesystem count of `blocks/*/*/block.json` and adjacent `render.tsx`
- September 14 live MagicTables readback: base `p5771rm40m4pjw4q4t4x9kdbb18dnm0b`, Blocks table `q97ft31dnn52vbeha9fdd3zfg98dv4sq`, 136 rows across two pages
