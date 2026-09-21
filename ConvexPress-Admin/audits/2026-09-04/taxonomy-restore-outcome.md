# Populated taxonomy restore acceptance

This advances C04 and A01–A03 recovery acceptance. The native full-backup/restore workflow preserved the populated Aster House staging site and rebuilt taxonomy and author counters from source. It does not complete maximum-capacity, interruption/fleet/packaged or overall production acceptance. Block renderer acceptance remains95/136.

## Deployment and backup

Verified the running Linux container `convexpress-test-control-plane` and its worker4720 → local14720 tunnel before using its existing credential. Captured a226-file dependency closure (control-plane, site-contract, runtime-clients, config), typechecked the actual payload in Convex preflight, verified no index deletions, and deployed successfully. The current source control-plane suite passes348tests/1976assertions across54files (`bun test ./convex` from its package directory). The first overly broad filter also selected historical checkpoint copies with missing source-test imports; those failures were isolated to the archived copies, and the corrected source run passed.

Through real Electron, created and verified fresh manual snapshot `snapshot_d2208a4181493f3644bf8838b0a204ce5cce16979525ee75`:280tables,15files,1.5MB. Selected that exact snapshot for the same staging instance, entered its required environment confirmation, and started restore. The app created verified pre-backup `snapshot_73d3751b5f2bd4c93fdef7ae4af34c88ab394132aa8dcfb2` before replacement. Operation `m17f8chnzey8p8gcpn70ak9t098dwy4z` completed6/6steps and immutable receipt `receipt_d61d25f4e02b6d5c3ddb375067bcdb6d4841dd14`. An observation timeout during import was followed on the same live operation; no duplicate restore was started.

## Source and rendered proof

Before/after authored hashes agree for all11posts/pages,4events and7terms. All14taxonomy relationship IDs, post/term IDs and ordering values survived exactly. Every term has a different count generation and all3author counter records have new IDs, proving rebuilding rather than merely trusting copied totals. All14relationship discovery records are ready. Independently recomputed counts match: Field notes3, Materials1, Slow living1, Slow rituals1, Uncategorized3, Craft1, Journal2; author totals also agree with current source posts.

The selected staging environment and signed-in operator remained in the existing Electron PID45019. Its category table recovered correct totals without reload. The canonical Navigation field guide editor reopened with7blocks and All changes saved. Its saved Website preview acknowledged receipt and rendered the restored Craft & care/Field notes labels; the actual screenshot was inspected. Public category archive and the7-block document both render restored stories, events/calendar and tags without page errors. No site code deployment or Website republish occurred during this restore acceptance; production was untouched.

Current staging media epoch: `mi_ready_60aa40c699ba4d83b9367dd4130a9c12`. Later deployment guards must verify this current epoch, not reuse the previous checkpoint's value. Health/auth/storage remain healthy for `cloud_careful_cormorant_268_staging` and `aster-house:aster-house`.

## Remaining work and new finding

Admin taxonomy collection/tree/total pagination caps, inherited100-relationship post-label cap, permission clock-expiry acceptance, and broader original audit/handoff work remain open. This1.5MB restore is not the maximum-capacity gate.

Observed a separate publication-date presentation mismatch: Latest Posts and Post Grid display Sep5 for stories whose category archive shows Sep4. Their block renderers explicitly hardcode UTC, while archive formatting uses the configured site timezone. Stored dates/content were not changed by restore. Next repair must pass site timezone through the authoritative block-data contract and keep server/client formatting deterministic, then verify agreement in the real rendered site.

Evidence: root `output/taxonomy-restore-20260906`, checkpoint `ConvexPress-Admin/output/control-plane-checkpoints/taxonomy-restore-20260906`, screenshot `output/playwright/taxonomy-restore-20260906/native-restored-preview.png`. MagicTables App Audits row `px7csry9fwgb7zfjgn249mmf4s8dx001` was updated after fresh schema/read and one-update/zero-create dry run; exact readback and unrelated-field preservation passed. No commits or pushes.
