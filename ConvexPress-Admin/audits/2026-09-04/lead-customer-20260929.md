# Lead Magnet customer lifecycle — September 29

Lead Magnet is accepted; verified tracker readback is **117 Verified / 20 In progress**,137rows. Only this row's Status, Tests and Screenshots changed; every historical Note and unrelated cell is exact. The full delivery goal remains open.

This batch exercises the production Lead Magnet host with two real Clerk development customers, an anonymous visitor and separate source/target Website runtimes. Evidence is in `output/lead-customer-20260929/`. The page and mailing list are disposable; the selected FieldNotebook file is the existing original file. Marketing consent stays unchecked in this batch.

## Actual account, retry and environment evidence

- Guest and both customers downloaded exactly308bytes, SHA-256 `0612f8d81d3226cbede18e7ae4dd28257dfc7bd2e0f0c874e187bf5b1ee673d2` (`downloads-exact.json`).
- The first customer's actual authenticated profile matched the created Subscriber account. Retrying its exact captured submission against the backend returned the same receipt (`customer-one-identity-retry.json`).
- A real Website download POST completed server-side with204; the browser acknowledgement was deliberately dropped. The UI displayed the failure and emitted no download. Clicking Download again succeeded with the same issued lease (`download-retry-red.json`, `download-retry-green.json`). This is a controlled transport fault around real backend processing, not a mocked success.
- Another actual204 acknowledgement was held while the user signed out through the account menu, then released. Download count remained one; the guest page had no receipt and an empty email field (`account-signout.json`).
- The second customer's actual profile matched its separate Subscriber record, with a fresh form and no previous receipt. Replaying the first account's exact submission under the second account was rejected. Its own submission and download succeeded (`account-two-isolation.json`).
- Deactivating the first account invalidated its still-unexpired delivery: metadata200 before,403 after, with more than a minute of lease life remaining (`account-revoked.json`). The second customer still downloaded successfully. Sign-out clears client-owned state; backend delivery capabilities retain their original stored principal until expiration, revocation or current source denial. The report does not claim that an issued bearer capability is deleted merely by browser sign-out.
- A separate Website preview on4323 used the actual target4870/4871 runtime. The source page returned404 there; the source lease returned403 both with the browser's existing same-host cookie and with an explicit proof POST. The original source route still returned200 and exact bytes. Returning to the source page produced a fresh form (`environment-isolation.json`). This proves real separate backend/cookie capability boundaries; it does not claim target Clerk sign-in, which remains E18.

## E61: a known-expired receipt poisoned a fresh request

After an issued receipt expired, Back to the form reused its request ID/secret. The backend correctly denied that expired lease; the UI produced a generic retry error instead of requesting a new copy. The original browser reproduced this after a naturally elapsed15-minute lease (`expiry-red.json`, `expired-retry-red.png`). No browser/backend clock or stored timestamps were altered.

The production host now forgets the attempt only when it has a confirmed receipt whose expiry is known to have elapsed. It creates a new request ID/secret for that fresh request. Attempts with an uncertain result keep their original identity, preserving the existing duplicate-prevention behavior. Existing receipt bookkeeping is retained for authorized opt-out handling.

The new regression failed before the repair; **11 lifecycle cases /33 assertions now pass**, including uncertain retry identity and stale callbacks after account/loading/instance changes, unmount, delayed download and unsubscribe. The isolated wrapper passes separately and is not an additional behavioral case. Website TypeScript, production build and scoped lint pass. No backend source/deployment change was needed.

## Reused evidence and explicit limits

[Forms acceptance](forms-acceptance-20260929.md) provides native media/file/list selection, exact history4→6 recovery, selected-list withdrawal, actual optional consent and opt-out, and24normal/minimum/maximum pack/width cases. [Production host lifecycle](lead-magnet-lifecycle-20260921.md) identifies the earlier stale-authority repair and its controlled lifecycle boundary. Current live identity and delivery checks extend that evidence; synthetic BlockDemo images do not substitute for them.

One early scripted customer submission was faster than the unchanged2000ms minimum fill time and was refused before creating a delivery; a later real retry succeeded. During the frontend rebuild, the old preview process retained an obsolete asset manifest, producing two dynamic-import errors. The owned preview was restarted and final customer checks have no page errors; those harness errors are preserved separately in `rebuild-harness-errors.json`.

## Final natural expiry, cleanup and tracker readback

The repaired customer browser reached its real15-minute deadline at `1790693029463`. The old backend lease returned403 and the UI displayed its expiry message. Back to the form preserved the submitted email; **one click** issued a distinct request and lease, and its downloaded file was again exactly308bytes with the original hash (`expiry-green.json`, `expired-retry-green.png`, `final-delivery-proof.json`). No reload, artificial clock change or record timestamp edit was used. Final readback contains exactly four intended deliveries and four download-request events, with zero subscribers. Both final customer browser/sign-out proofs have empty page-error collections.

`cleanup.json` confirms removal of the owned page, archived list, both local customers inactive, both Clerk users deleted, both owned API sessions revoked, browser closed and private credentials/proofs removed. Both deactivation events finished successfully before notification templates were restored. Original42source pages/lists/email queue99/settings/template values and28target pages/appearance remain exact. All tested capabilities are now unavailable and the owned public route returns404. The separate target preview was stopped; the current source preview stays available. Four bounded delivery records, four consent audit events without subscription, the archived list and normal account/event history remain explicitly.

The one-row dry run planned one update and no creates. A fresh preapply comparison and exact full137-row readback confirmed117/20 with every Note and unrelated cell preserved (`mt-accept-verified.json`). RSVP legitimate provider/current generated-selection review, other20rows, Tasks4–8 and E18/E22/E28 remain open. E22 screenshot mapping progressed separately; its centralized-test mapping still fails the full tracker gate.
