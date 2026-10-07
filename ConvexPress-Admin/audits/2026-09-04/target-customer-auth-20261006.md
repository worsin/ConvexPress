# Target development customer identity — 2026-10-06

The disposable Promotion Lab target at 4870 now accepts a real development Clerk `convex` session token. This removes the demonstrated missing-provider configuration failure. It does not yet accept Recently Viewed: an actual signed-in source→target→source browser journey and target profile provisioning remain required.

## Cause and repair

Fresh authorized getStatus reads confirmed source had a working development connection; target had no secret, publishable key or issuer in settings or environment. The four canonical draft functions were already present, contrary to the stale September 29 blocker wording.

Prepared exactly CLERK_JWT_ISSUER_DOMAIN, CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY from the existing development connection for the source and target environments of this same disposable Website. All three target originals were absent and recorded privately. A full target data/storage export was retained privately before mutation. Applied those three environment values and redeployed the target's own installed legacy-reusable-retirement snapshot so auth.config includes its optional Clerk provider. No source snapshot was substituted and no database imported.

Strict deployment succeeded. All 1,620 installed source file hashes remained identical; the complete registered function contracts before and after were equal. This is an environment-only repair, with no product source patch or weakening of issuer/audience checks.

## Verification and limits

Created one owned development Clerk probe identity, minted an actual Clerk session token with the convex template, checked issuer/audience/subject, and used that token with a normal ConvexHttpClient against the actual target. Its public Website auth-config query succeeded, reported Clerk/development and deploymentTrustsIssuer=true. The earlier target could not accept the token at all. Revoked the probe session, deleted the owned Clerk identity and verified 404; no token or secret appears in repository evidence.

Target getStatus confirms the secret is available from environment. The stored connection metadata remains absent (`settingsIssuerRecorded=false`), so its setup/readiness display still needs reconciliation through the normal connection workflow. Do not equate token acceptance with complete setup, target customer provisioning, a browser sign-in or final E18 parity. No webhook or production-readiness claim.

All 28 original target pages, appearance identity/values, general/reading settings and menu locations remained exact. The verification operator session was revoked and refresh returned401. The intended three development environment values remain installed. Private configuration baseline and data/storage backup permit rollback; do not restore absence while continuing the required signed-in acceptance.

Evidence: `output/target-customer-auth-20261006/` contains prepared metadata, backup hash, sanitized strict deploy log, unchanged contract snapshot, token-proof and preservation receipts. Private inputs remain under the acceptance-secrets directory. No push.
