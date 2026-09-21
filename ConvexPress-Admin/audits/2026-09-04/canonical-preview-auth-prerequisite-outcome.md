# Canonical preview authorization prerequisite

September 5, 2026. Root live acceptance on isolated Aster staging.

The proposed vertical plan assumed a Website Clerk account could receive effective Editor authority and read private drafts. The actual deployment disproves that assumption. `helpers/permissions.ts` deliberately grants internal roles only to local/management identities, and `users:checkAdminAccess` independently excludes Clerk accounts. These controls preserve the standalone customer/operator boundary and must remain.

Root created `aster.editor+clerk_test@example.com` through the actual Website invitation/registration/verification flow. The invitation used `sendNotification:false`; the site's email delivery setting was read back as disabled. Clerk test email code verification followed its documented development mechanism, with an authorized instance testing token used only in the isolated acceptance browser to handle bot protection. Normal post-registration session tokens came from the actual Clerk session.

The site provisioned this account as Subscriber. Native user editing accepted an Editor assignment and the backend stored the Editor role, but the normal Clerk identity still received null for admin access and for the existing unpublished care page. This is correct denial behavior paired with an incorrect role-assignment UI/server acceptance. Root restored Subscriber through the native editor and verified it. The original River Guest customer remains Subscriber.

Evidence: `output/aster-house/canonical-preview/operator-customer-auth-boundary.json`. New fixture user `jh8f4vtnkyzs9qzxgbs2eaqf018dtjd0`, invitation `px7td4edwmvsk1ajptrhzc61xh8dv9g4`; credentials/session state are private outside the repository. No draft was exposed or altered. The account remains a disposable customer fixture, not a verified preview editor.

Next actions:

1. Reject ineffective internal-role assignments for Clerk identities in both role assignment endpoints, and filter/explain eligible choices in native editing. Preserve operator authority and existing self/last-admin protections.
2. Revise canonical preview transport around the actual authorized desktop operator, installation/document/revision scope, short-lived server-side exchange and current permission/revocation checks. Do not put a general management bearer in URL, persisted browser storage or postMessage, or weaken customer policy to make the test pass.
3. Finish the existing native editor save/revision and real renderer work against the reviewed backend contracts. Private preview authentication remains unaccepted until its supported transport is implemented and tested.

References: [Clerk test addresses and email codes](https://clerk.com/docs/guides/development/testing/test-emails-and-phones), [Clerk testing tokens](https://clerk.com/docs/guides/development/testing/overview). Test-token bot handling follows the official Playwright helper behavior; it is acceptance infrastructure, not production authentication.
