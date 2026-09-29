# Poll customer policy and revision acceptance — September 29, 2026

MagicTables readback: **114 Verified / 23 In progress / 137 total**. Only Poll Status/Tests/Screenshots changed; all137 Notes and other cells are exact.

`core/poll` is accepted using the current live evidence here plus the six-block native authoring, exact revision recovery, guest keyboard/deduplication and24-case normal/maximum/minimum pack matrix in [Forms acceptance](forms-acceptance-20260929.md). No product/backend changes were needed in this continuation. Other Forms authority/provider gates remain open.

## Two real customer accounts

Two disposable Clerk development users were created with actual site customer/subscriber roles. Each signed in through the real Website login and development test-code flow. The registered profile query confirms the authenticated IDs and expected roles. Credentials/tokens remained in private files and were removed during cleanup.

The signed-out page displays the real sign-in requirement, no selected answer and a disabled submit action. A registered anonymous vote request with a syntactically valid browser token fails `POLL_UNAVAILABLE`; tally remains0. Customer1's actual double-click records exactly1vote for `make`, and reload restores the selected answer. Signing out navigates home; returning to the same poll removes the selected answer and requires sign-in. Customer2 signs in in the same browser and has no preselected answer, then double-click records one separate `observe` vote, total2. Its registered snapshot returns only its own selected key. A repeat request with a different browser token is acknowledged `accepted:false`, retaining `observe` and total2.

## Meaning changes and presentation changes

The persisted definition version hashes the question, key-sorted choices and response policy, excluding display order and results visibility. Current-source live tests prove:

- Reordering choices preserves the exact definition version, total1 and Customer1's `make` selection.
- Hiding results preserves the ballot and repeat guard while the public projection returns null total/counts and the rendered page shows no percentages.
- A changed question opens a distinct empty ballot. An authenticated attempt using the previous version is refused without changing the new total. An actual vote for `share` creates its own total1.
- A changed choice label opens another empty ballot.
- Restoring the original canonical content recovers its original definition version, total1 and Customer1's original `make` vote. Customer2 subsequently adds the second original-ballot vote.
- Unpublishing the page removes the mounted poll and settles at404. With a freshly obtained valid Customer2 token, registered poll reads return null and writes are refused. Republish restores total2 and that customer's own selection.

A bounded read of the owned source's actual records confirms exactly3votes across2populated tallies: original ballot2 and changed-question ballot1. No fabricated tally or test-only provider was used. The first withdrawal API probe encountered a genuinely expired short-lived Clerk token before reaching the poll handler; the token was refreshed through the active session, then the source-refusal check passed. This distinction is retained.

## Rendered and focused checks

Sixteen settled real cases pass: customer2/already-voted and guest/denied × Core/Journal/Depot/Aster ×1440/390. Each shows2responses, the correct own-selection boundary, disabled repeat/guest submit and exact viewport width; no page errors. Mobile Aster and desktop Core screenshots were visually inspected. Current backend poll suite:14tests/121assertions pass, covering registered identity, source restrictions, tally integrity, rate/security and provider-verification race boundaries. Those provider cases are controlled tests, not a claim that live CAPTCHA was exercised. Unchanged native and maximum-input evidence is reused from the immediately preceding Forms batch.

## Settings-alert correction and cleanup

The final bounded queue read discovered72new `settings-changed-alert` rows:12from the preceding Forms email-setting restoration and60from this batch's five template-setting mutations. Each was still queued with0attempts. All six event IDs resolve to the exact acceptance operator, `settings.updated`, and the intended email/appearance sections. The site has no configured email-provider key. Every one of the72rows was cancelled through the registered `emails/mutations:cancelEmail` operation and read back as cancelled/0attempts; all27pre-existing queue rows are exact. The final queue has99rows, including those cancelled audit records. No actual provider delivery occurred.

This corrects the preceding checkpoint's broad implication that the queue remained at27after cleanup. That snapshot was taken before restoring `email.enabled`; the restoration itself created12alerts asynchronously. Newsletter submissions were still deduplicated and created no delivery jobs. Future acceptance batches must suppress the specific settings-alert template before template changes or email restoration, restore it last, wait for event completion and verify the queue afterward. The settings handler explicitly ignores `email_templates` changes, so this suppression/restoration need not generate another settings alert. Do not replace or delete unrelated queue rows.

For customer cleanup, the original account-deactivated template was captured and temporarily muted; both exact deactivation events completed without listener failures before its active value was restored. All template values are exact; that template's audit timestamp advanced normally. The two site profiles are inactive and their Clerk identities are deleted. Owned page removed/route404; original42pages, appearance values, email settings and form security exact. Browser closed, private profile/credentials/token files removed and API session revoked. Retained:3poll votes/2tallies, inactive profiles, normal event history and72cancelled alerts. Prior Forms residuals, including the single synthetic newsletter subscriber, remain explicitly unchanged.

Runtime remains owned Website72085/PTY44566 on4322, Admin origin127.0.0.1:4105, source4860/site4861; backend snapshot unchanged. Owner Electron39198, Admin62672, BlockDemo65092 and SOCKS68390 preserved. No push or subagents.

## Opus20

F27's broad “finding is not yet in the blocker” statement is contradicted by E18's existing `currentEvidence` and `nextCheck`, which already name the missing Clerk provider and provisioning secret and the required recheck. Its short `status` summary still described only the earlier draft-function divergence; that summary is now expanded. Audit20's six-Forms-rows wording also predates Newsletter acceptance. The useful request is consistent handoff summaries; no new product defect follows from the stale short field.

Evidence: ignored `output/poll-policy-20260929/` includes customer/guest UI, revision snapshots, stale-definition and withdrawal refusals,16-case matrix,14-test log, ballot counts, exact alert-event provenance/cancellation receipts, cleanup and tracker readback. Current report/status JSON carries the durable interpretation. Goal and Tasks4–8/E18/E22/E28 remain open.
