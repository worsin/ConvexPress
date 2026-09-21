# Website operator handoff

The Website's Clerk session represents a customer. Existing backend rules deliberately deny customer identities internal roles, so the current on-site Customizer has no legitimate operator entry path. Complete HB1 without weakening that boundary or requiring clients to manage a second password.

## Design

- Add an explicit desktop **Customize on website** action. The authenticated site operator creates a random 256-bit handoff secret locally and submits only its SHA-256 hash to the selected site's backend.
- The backend requires `manage_options`, captures current local/management authority, binds it to the installed website/environment and configured public website origin, and stores no access token or credential. Handoffs expire after60seconds, are single-use, have a per-user pending limit, and are removed by a scheduled expiry callback.
- The desktop opens the configured website with the secret in the URL fragment. Fragments are excluded from HTTP requests/referrers. The Website removes it immediately and POSTs it to that deployment's handoff endpoint. Origin, expiry, installation and current user/role/management authority are checked again in the atomic consume transaction.
- The backend signs a token through its existing local/management JWT provider. Management tokens retain the existing parent session and cannot outlive it. Website tokens last at most five minutes. No independent authority, refresh token, new password or customer-role elevation is created.
- The Website holds the token in memory only and uses its existing Convex provider. Operator session changes remount the protected subtree. The customer Clerk session remains separate. The toolbar explicitly ends the operator session; expiration/reload requires reopening from the desktop.
- Customer/public requests cannot create a handoff. Expired or consumed codes are refused; a wrong-origin request cannot consume a code. The unused code is a short-lived bearer secret and must stay out of logs and artifacts. Revoking parent management authority or user/role permissions continues to revoke backend access.

## Implementation and acceptance

1. Add bounded handoff storage, capture/revalidation helpers, create/consume/expiry handlers, token expiry support and HTTP endpoint. Exercise real registered handlers for denial, replay, origin, scope, expiry, role/password/management changes and queue bounds.
2. Add desktop launcher and Website in-memory provider/toolbar integration, with no access/refresh tokens in URLs and no secrets in logs or persisted browser storage. Verify real Electron launch and actual authorized Website rendering alongside anonymous/customer denial.
3. Exercise the on-site panel's draft/discard/save/reload/publish/conflict, contextual fields and device preview. Repair exposed defects and preserve per-pack settings.
4. Restore all fixtures, revoke/close owned sessions, record exact evidence and integrate. Keep broader handoff/release acceptance open until proven.

This implements the user's existing authorization to finish the template handoff and preserve distinct operator/customer identities. It does not change the customer authentication provider or grant new roles.
