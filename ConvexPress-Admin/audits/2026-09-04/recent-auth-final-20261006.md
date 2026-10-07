# Recently Viewed — signed-in environment acceptance

Tracker readback: **133 Verified / 4 In progress / 137**, exactly one row updated (Status, Tests, Screenshots), all Notes and other cells preserved.

October 6 closes Recently Viewed's remaining signed-in source→target→source acceptance. This reuses its prior native authoring/restore, account-change, ordering/limit, withdrawn-product and four-pack desktop/mobile evidence in `customer-commerce-20260929.md`, plus guest scope isolation in `recent-site-switch-20260929.md`. It does not close full E18 artifact parity or Task 8.

## Actual workflow

One ordinary IAB browser tab used `http://127.0.0.1:4322` throughout. It signed into one owned development Clerk customer using the actual Website email/password flow and documented development email-code verification. Both separate databases successfully linked that customer through normal profile provisioning; the prior target missing-secret/provider failure is repaired. Clerk's documented test-address behavior is at https://clerk.com/docs/guides/development/testing/test-emails-and-phones . No browser storage, tokens, resolver results or application state were injected.

The Website runtime used the production artifact from the E102 repair, with source4860, target4870, then source4860 configurations. The same browser session persisted across process restarts:

1. Source: signed-in Dashboard showed the owned customer. An ordinary product-detail visit produced exactly Recent history source study in Your source discoveries.
2. Target: customer remained signed in; the hydrated canonical document resolved, showing Your target discoveries with an empty state and no source product. This is the point where the September29 attempt remained Loading document with a rejected token.
3. Target product detail: an ordinary visit then yielded exactly Recent history target study in Recently Viewed, with its $12 price and no source product.
4. Source return: original signed-in source history reappeared exactly, with no target product. Runtime values were compared exactly to the captured source configuration.
5. Signed out through the Website account menu and observed Sign In/Register. The tab was closed.

Source, target-empty, target-visited and source-restored DOM/capture receipts are in `output/recent-auth-final-20261006/`. Target-visited and source-restored full-page screenshots were visually inspected. The intentionally imageless test products use the designed text fallback; these are live scope checks, not a replacement for earlier image/four-pack layout acceptance. Source leaf hashes and artifact references are in source-provenance.json.

## Preservation and cleanup

All43 original source pages and28 original target pages remained exact. Both owned pages were recoverably trashed and both products deleted through normal product APIs. Three original source products retained exact values except ordinary joined category audit timestamps; target returned to zero products. Appearance values/identity and plugin values were preserved. Target commerce was restored to disabled. Original email template values and send counts were restored, retaining normal update timestamps. The two owned customer profiles are inactive; their normal session/provisioning/audit history remains. The owned Clerk identity was deleted, test credential files removed, API sessions revoked, owned browser closed and Website process stopped. All seven protected processes remain alive.

The fixture initially called the retired pages/mutations:create endpoint from an old harness. It failed before page creation; the journal then used canonical create/save/updateMetadata/publication. Cleanup resumed from its acknowledged journal after correcting the email-queue response shape. These were harness errors, not new product regressions or replayed writes.

One suppression gap is explicit: login-new-device was outside the initial registration/profile/account template filter. Source queued one notice to the synthetic test address; it failed before contacting Resend because no API key is configured. The record is terminal failed, with no sentAt or nextRetryAt. Source inspection confirms this error is non-retryable and the cron selects queued records only. It is retained as normal failed-email history; do not manually retry it. Target had no owned email queue record. No outbound test message was sent, and no false zero-queue cleanup claim is made. Future test preparation must include auth/login template events before sign-in.

The intended target development identity configuration from `target-customer-auth-20261006.md` remains installed. Stored connection/setup metadata remains a separate integration follow-up; actual target customer provisioning and this browser check now pass. No push.
