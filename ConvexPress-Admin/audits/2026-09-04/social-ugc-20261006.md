# UGC acceptance and Social Feed provider gap — 2026-10-06

`core/ugc-grid` is accepted on accumulated native, backend, public, responsive and motion evidence. `core/social-feed` stays In progress: configured Mastodon works, but the declared Instagram provider has no implementation. No product source changed in this batch; product artifact is `6fc1e5fa`, starting report HEAD `5d02c93f`.

## Current runtime evidence

Artifacts: `output/social-final-20261006/`.

- In the actual isolated Electron Admin, selected the owned October community tag, changed UGC limit from 2 to 3 and Social Feed limit from 2 to 1, saved and reloaded. `native-readback.json` confirms canonical revision 5, exact values and source/target isolation. `native-reopened.txt/png` shows saved native authoring and actual Website preview.
- Actual Website paginated the three approved generated photographs 2+1 (`public-first.txt`, `public-next.txt`). Lightbox Next reached the second photograph; Escape closed it and restored focus to the opening button.
- Live consent expiry withdrew the remaining image without reload: expiry 16:11:24.081Z, observation 16:11:45.715Z. `after-expiry.json/txt/png` records zero images/dialogs and restored scrolling. The earlier modal had already closed before expiry during refresh; this is image-withdrawal proof, not an exact modal-at-deadline claim.
- An approved photograph attached to a private draft was omitted while two public photographs remained (`private-parent.txt`). Detaching restored all three. Revoking consent while the third photograph was open closed the lightbox and restored scrolling without reloading (`before-revocation.txt`, `after-revocation.json`).
- Current Core captures at 1440 and 390 show all three images loaded, entrance states entered and no gallery overflow (`public-visual.json`, `public-1440.png`, `public-390.png`). Both public captures and the native reopen capture were visually inspected.
- Actual configured `mastodon@mastodon.social` posts render publicly and in native preview, and authored limit 1 survives save/reload. This accepts the Mastodon path only.

## Reused evidence and focused checks

Reuse September 15 UGC native tag/count/save/publish/reopen, approval/revocation, four-pack wide/narrow lightbox/paging/keyboard/empty/unavailable/broken-image/reduced-motion evidence in `output/ugc-grid-block-20260915/` and the original production ledger. Reuse `motion-review-20260921.md`: four-pack viewport entrances, observer fallback/ref cleanup and actual desktop frame observations. Current behavior agrees with those records; no duplicate full matrix is claimed.

Current media showcase, tagged-media and social cache/Mastodon backend suites: **35 tests, 334 assertions pass** (`focused-tests.log`). Root block contracts, generated synchronization and block-kit checks pass (`blocks.log`, `sync.log`, `kit.log`): generated wiring remains current. These focused checks do not imply repository-wide acceptance.

## Explicit remaining Social Feed work

The canonical provider enum declares Instagram and Mastodon. `ConvexPress-Admin/packages/backend/convex/socialFeeds/policy.ts` rejects Instagram setup because its account adapter is unavailable; only the Mastodon adapter exists. This is an implementation gap, not merely missing credentials or screenshots. Complete a configured authorized Instagram account adapter, private credential ownership and normal native configuration, then verify actual publishing/cache/expiry/revocation. Do not put provider credentials in block content, remove the declared provider to claim completion, or scrape an unauthenticated account as a substitute. Cache limit is the current feed contract; no new continuation UI requirement was invented.

## Preservation and cleanup

`restoration.json` confirms all original 43 source and 28 target pages, appearance, general/reading settings and menu locations are exact; all 12 original media records and the old UGC approval are exact. Existing social configuration (identity/provider/handle/enabled/revision) is preserved; naturally refreshed cache timestamps were not compared as immutable state.

The two owned pages and three uploaded generated images are recoverably trashed; their three showcase consents are revoked. The owned taxonomy tag remains for recoverability. No real customer data was created or changed. Native selection restored to Live 4870 and normal signout observed. Both API sessions revoked; refresh returns 401. Owned native PID 77913, Website PID 77914 and private native profile removed; all seven protected processes remain alive. Owned browser tab 43 closed and viewport reset. `cleanup.json` and `native-signout.txt` retain receipts.

## Tracker

Only the UGC row is eligible for promotion: Status, Tests and Screenshots. All Notes and unrelated cells must remain exact under guarded dry-run/apply/full readback. Social Feed remains open under E98. This report does not close the whole delivery goal.
