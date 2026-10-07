# Instagram private native authorization — 2026-10-06

Implementation and isolated staging acceptance checkpoint; E98 remains open for a real authorized Instagram account.

## Delivered

The normal Social feeds screen can create an Instagram source with private authorization, reopen masked authorization, replace its token, or change non-secret account metadata while retaining the saved token. Existing environment-configured sources remain supported. Revision conflicts preserve the draft and require explicit reload. New usernames require a separate source.

Site-owned authorization uses the existing AES-256-GCM primitive and mandatory SHIPPING_PROVIDER_ENCRYPTION_KEY; there is no base64 fallback for these tokens. Only the refresh action decrypts credentials. Public/admin source projections omit plaintext and ciphertext. Account binding, approved image origins, site ownership, manage_options and expected revisions are enforced. Authorization changes clear cached posts and invalidate old refresh jobs. Generated consumer contracts were regenerated.

## Evidence

Evidence directory: output/instagram-authorization-20261006/.

- Red-before-green registered test; backend.log: 29 tests / 244 assertions passed, including authority, encrypted persistence, metadata retention, stale refresh rejection and missing-key refusal.
- form.log: mounted native-form regression passed, including private draft submission, failure retention, revision conflict and permission loss.
- backend-types.log and admin-types.log: clean type checks.
- contract-check.log: 39 Admin and 39 Website API compiler fixtures passed.
- Actual isolated native Electron window: reopened saved masked authorization; changed non-secret API version and reopened persisted value; Replace exposed a blank secure input with saving blocked; canceled. native-reopened.png/txt.
- storage-proof.json: actual staging database ciphertext verified and decrypted privately in-process to prove exact token retention after native metadata save; no credential contents emitted. Fixture remained disabled and made zero provider requests. API versions in this synthetic fixture are test values, not current-provider compatibility claims.

## Isolated deployment and key prerequisite

Only disposable staging source on port 4860 received the installed-source-preserving deployment. Target 4870 and controller 4720 were untouched. Sealed checkpoint: ConvexPress-Admin/output/production-checkpoints/instagram-authorization-source-20261006. installed-source-proof.json records 1,633 hashed files, 2,397 to 2,398 functions, no removed functions, and only the expected Social feeds interface changes. Storage-inclusive backup retained privately before deployment.

The staging source had no root encryption key. Provisioned its existing standard SHIPPING_PROVIDER_ENCRYPTION_KEY using a private file, retaining a mode-0600 recovery copy outside the repository. No existing key was replaced. This enables AES for future writes by existing integration consumers too; existing settings were not rewritten and their legacy base64 decryption remains supported. The key must remain with this source and must not be casually deleted or rotated.

## Cleanup and remaining acceptance

cleanup.json: original 71 pages and settings preserved; owned disabled source removed; original social configuration preserved; both API sessions revoked and refresh refused with 401; original Live selection restored; native signed out; owned PID 87510 stopped and private profile removed; seven protected processes alive. Staging encryption key and private backup intentionally retained.

This proves private operator configuration and native encrypted persistence, not successful Instagram provider access. A real authorized professional account, actual public feed, expiry/revocation and unavailable behavior remain E98. No real provider token was configured. Tracker remains 130 Verified / 7 In progress. Continue synced content and live legacy migration independently. No push.
