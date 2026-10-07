# Original Assistant customer history adoption — October 7, 2026

Repair `b4c31a85` is locally integrated and installed on original Alpha (Northstar Coffee). Real customer sign-in now keeps the guest conversation and saved preferences when recovering the customer's existing cart. This closes E111; the full Assistant block remains pending its separately recorded disabled-memory grounding, request-idempotency and catalog visibility/read-bound requirements.

## Reproduction and repair boundary

Using the site's existing development Clerk connection, created two disposable customer identities. Normal Website password/test-code sign-in and site-local provisioning gave customer roles, with no operator authority. The original configured model answered a 51 mm tamper question and saved the stated preference. The customer added one original product to its own basket. After sign-out, a new guest asked about manual grinders for camping and explicitly requested a saved preference.

Before the repair, sign-in recovered the earlier customer cart but returned only its two prior messages and one preference. The guest's two messages and camping preference disappeared from the selected thread. The old guest token remained anonymously readable. Two focused regressions failed against the same missing adoption paths.

The repair claims guest session ownership and moves preferences into the account subject before returning the recovered session. Conversations combine without changing message IDs, original timestamps, bodies, model metadata or feedback. The latest visible history transfers atomically; older messages drain in 250-row scheduled batches. Owner-bound session redirects route late replies correctly. An optional adoption epoch and indexed reads preserve clear semantics, including a clear during transfer and a previously scheduled clear. Repeated settlement and explicit basket combination do not duplicate messages. The existing forty-fact preference retention policy and expiry are retained. Cart pricing, stock and checkout rules are unchanged.

## Verification

- 402 commerce tests pass, including 610-message preservation/drain, late replies, clear/transfer races, repeat settlement, explicit basket combination, memory deduplication/expiry, foreign-owner denial and existing cart recovery conflicts.
- 3,522 backend tests pass (20,457 assertions). This is the `convex/` suite, not a claim about every repository test.
- Strict backend TypeScript, media-writer/consumer guards and frozen-candidate strict deployment passed. Existing generated extension schemas compare exact. Source snapshot and rollback configuration retained privately. The first frozen check lacked its ignored generated extension index; running the normal generator corrected preparation. Upload retries recovered within the original install; it was not restarted. Existing operator session survived deployment.
- Installed source readback confirms the history module, 1,783 compiled modules and the new additive index. Only Alpha received this backend update; remaining installed-fleet parity belongs to the final candidate rollout.
- Recovered the stranded owned test conversation through normal authenticated settlement, obtaining four messages/two preferences and anonymous denial. Then repeated the full browser workflow with a fresh guest question and preference: ordinary sign-in automatically retained **six messages, three preferences and one cart item**. Repeated settlement retained six messages. Another account was denied the first customer's thread and memory, and had empty independent state.
- Another session for the same customer could read all three account preferences. Reload retained six messages. Desktop and settled 390px mobile drawer displayed the conversation and three Forget controls; screenshots reviewed. Captured page errors: zero. Mobile Forget and Clear conversation controls removed the owned data, verified by normal API reads.

Test harness corrections (sign-in label/readiness, navigation settling, the cart query name and structured Convex error-code inspection) are distinguished from product failures. No fake provider answer or substituted customer identity is claimed.

## Preservation and cleanup

All preexisting selected records compare exact: 15 users, nine posts, 50 storage records, 14 settings rows, four Assistant sessions, eight messages, one memory fact, three carts and two cart lines. The real `emailQueue` contained 15 unchanged records, with no owned test email queued. Two test customer profiles are inactive and both Clerk identities deleted; the second test API session was revoked. The deactivation notification template was temporarily disabled, both exact owned events completed, and its values restored; only its normal audit timestamp advanced.

Test history, preferences and basket are empty. Normal inactive profiles, empty session/cart records and audit events remain. The browser signed out and closed; the owned temporary SOCKS process stopped and six private credential/token files were removed. All 14 protected app/example/tunnel processes remained alive. Original content, provider credentials, account sessions and other sites were preserved. No checkout, payment, public content edit or Git push occurred.

Evidence: `output/original-assistant-customer-20261007/`, especially `regression-before.log`, `commerce-tests.log`, `backend-tests.log`, `types-final.log`, `live-before.json`, `installed-recovery.json`, `live-after.json`, `mobile-reload.json`, `other-customer.json`, `customer-role-proof.json`, `install-session.json`, `installed-source.json`, `browser-data-cleanup.json`, `cleanup-data.json`, `runtime-cleanup.json` and reviewed desktop/mobile captures. Initial baseline entries for nonexistent `post_revisions`/`email_queue` are not used as preservation evidence; cleanup checked the actual `emailQueue` separately.

Next bounded batch: test disabled-memory grounding and Assistant request replay semantics, then reconcile the Assistant's actual catalog readers. Reuse accepted customer/provider/UI evidence. Task 7 selected-resource generation and AI composition/style/promotion remain separate and open; the block tally stays 134/137.
