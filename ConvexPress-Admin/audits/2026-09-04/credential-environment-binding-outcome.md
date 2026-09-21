# Refresh and API credentials stay in their issuing environment

Implemented the bounded credential repair identified in `promotion-environment-isolation-finding.md`. No promotion/archive implementation was changed.

New refresh-token rows and API-key rows carry optional schema field `environmentBinding`, set by the server at issuance to the normalized `AUTH_ISSUER_URL` origin. This deployment configuration is retained outside database snapshot imports. Issuance fails when it is missing or malformed. Exact environment matching is mandatory for refresh lookup, atomic refresh rotation, logout revocation, and API bearer authentication. New rotated refresh rows receive the same current binding. API mismatch is rejected before status changes, usage counts, rate-limit writes, or access is granted.

Files under `/Users/worsin/.codex/worktrees/convexpress-hardening/ConvexPress-Admin/packages/backend/convex/`:

- `auth/environmentBinding.ts`: shared normalized authority comparison, fail closed for missing/invalid configuration or unstamped credentials.
- `auth/internals.ts`: stamp creation/rotation; scope lookup/rotation/revocation.
- `api/mutations.ts`, `api/internals.ts`: stamp creation and require binding before authentication.
- `schema/auth.ts`, `schema/api.ts`: optional fields preserve schema deployment compatibility with existing rows.
- `auth/__tests__/credentialEnvironment.test.ts`: actual issuance, internal verification, and public refresh HTTP regression coverage.

Compatibility: existing **unstamped** local refresh tokens and API keys are no longer accepted. The source environment of legacy copied rows cannot be established safely, so there is no automatic adoption/migration. Users must log in locally again or issue replacement API keys. Existing Clerk sessions and control-plane operator exchange use separate authentication paths and are unchanged. A stamped credential restored to its original environment remains usable subject to its normal status, expiry, scope, and user checks. Changing the deployment's configured authority also invalidates its former binding; environment setup must continue to use distinct correct authorities.

Verification:

- Regressions first failed because minting returned unstamped rows and legacy lookup accepted them.
- Focused tests: 3 passed / 16 assertions. They retain the exact stored snapshot-like rows while changing target deployment authority: copied refresh receives HTTP 401; direct rotation also fails without new rows; copied API bearer fails with no usage/rate-limit mutations. Returning to original authority permits refresh/token rotation and API authentication. Legacy and missing-environment paths fail closed.
- Full auth suite: 54 passed / 289 assertions, including actual first-admin create → login → refresh → logout HTTP flow and Clerk provisioning coverage.
- Backend TypeScript and scoped whitespace checks passed.

This prevents cross-environment use of copied refresh/API credentials. It does not make full snapshot promotion safe: copied local password hashes, customers/orders, configuration ciphertext, Clerk settings, and operational queues remain separate confirmed concerns. Root owns the content-promotion architecture correction. No live provider, database, browser, promotion, or deployment calls were made by this agent.
