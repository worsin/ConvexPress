# Cloudflare OAuth custody, renewal and API-token recovery

Implemented locally in the hardening worktree. This agent made no live provider calls, read no real credentials, and did not deploy or register a client. Root separately registered the genuine client and owns native acceptance.

## Supported flow and configuration

Cloudflare supports self-managed OAuth clients with Authorization Code and S256 PKCE, including refresh-token grants. The agency control plane remains the credential custodian; customer site databases are uninvolved. Desktop main receives the loopback callback and completes authorization through the same authenticated operator client. No public control-plane callback endpoint or public agency hostname is required.

Root confirmed registration accepted these settings:

- Client name: ConvexPress Desktop; public client with token authentication `none`; `authorization_code` and `refresh_token` grants; response type `code`.
- Exact callback: `http://localhost:47123/hosting/cloudflare/callback`.
- Required registered scopes: `workers-scripts.read workers-scripts.write account-settings.read offline_access`.
- Private visibility for current acceptance. Distribution to unrelated Cloudflare customers needs the provider's public-client/domain-verification requirements completed separately.

Durable control-plane environment configuration: `CONVEXPRESS_CLOUDFLARE_OAUTH_CLIENT_ID`, `CONVEXPRESS_CLOUDFLARE_OAUTH_REDIRECT_URI`, and `CONVEXPRESS_CLOUDFLARE_OAUTH_SCOPES`. Existing versioned connection-envelope encryption configuration seals all credentials. No client secret exists for this PKCE flow. Wrangler's client ID, access token, refresh token and local profile are never read or imported.

Primary sources verified September 4, 2026:

- [Create an OAuth client](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/) documents PKCE/public clients, registration and visibility.
- [OAuth integration endpoints](https://developers.cloudflare.com/fundamentals/oauth/integrate-with-cloudflare/) and [provider discovery](https://dash.cloudflare.com/.well-known/openid-configuration) establish the exact authorization/token endpoints, S256 and offline access.
- [Account token verification](https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/verify/) and [user token verification](https://developers.cloudflare.com/api/resources/user/subresources/tokens/methods/verify/) supply authoritative token status and optional expiry.
- [Account details permissions](https://developers.cloudflare.com/api/resources/accounts/methods/get/) and [Worker upload permissions](https://developers.cloudflare.com/api/go/resources/workers/subresources/scripts/methods/update/) support the selected account and Workers permissions. Root verified the actual dotted scope identifiers from the registered client.

## Implemented behavior

`hosting/cloudflareOAuth:begin` accepts organization, optional business, exact external Cloudflare account ID and expected account revision. It stores an encrypted PKCE verifier and a hash of fresh random state, bound to the initiating operator, scope, registration and ten-minute deadline. The response contains only the authorization URL, callback and state. `complete` reauthorizes that same operator and current hierarchy/account revision before exchanging the code, verifies exact account identity, and atomically attaches the encrypted tokens to the existing account ID. Completed callbacks are idempotent. Completed attempts clear their verifier and temporary token envelope.

The code exchange has a durable single-use claim. An uncertain exchange cannot blindly replay the authorization code. A returned token bundle is encrypted and persisted before follow-up provider verification, so that verification can resume without another exchange. A changed operator, disabled parent, changed account revision, unexpected state, changed OAuth registration or different provider account cannot attach credentials.

`getCloudflareToken` renews OAuth credentials before publication when fewer than two minutes remain. Renewal has an exclusive durable claim and a separate credential generation. New token bundles persist before account verification. A successful refresh advances the credential generation but preserves the account revision and account ID; this avoids invalidating active release receipts merely because an access token renewed. A saved response can resume verification after a process failure. An expired claim with no saved response requires reconnection rather than a repeated rotating-token request. Revocation/replacement clears pending credentials and fences old workers.

`websitePublish` uses the renewed credential and checks its generation again after provider reads, in addition to existing release lease, authorization, identity and account revision checks. A token replaced during those reads is not released to desktop main or used to confirm the release.

Hosting Accounts now offers **Connect with Cloudflare**, **Reconnect**, and **Check access**, with credential method/state/expiry displayed. Root owns the corresponding desktop loopback relay and its sender/state/host/path checks. An explicit user or account API-token alternative verifies status/lifetime using the matching official endpoint. Inactive/expired/not-yet-valid/malformed token metadata fails closed. Replacement preserves the account ID and verifies exact provider identity. Legacy tokens show reconnect guidance; no expiry or refresh ability is inferred from an opaque token.

## Validation and remaining acceptance

Control-plane, Admin web and desktop TypeScript pass, and scoped diff whitespace checks pass. The hosting suite passed 74 tests/412 assertions before the final additional API-token handler regression; the final OAuth/API-token subset passes 11 tests/153 assertions. Tests run real handlers with local Convex schema enforcement, declared argument-shape checks, actual encrypted envelopes and mocked provider HTTP only. Coverage includes PKCE fields, secret-free summaries, state/operator/account/hierarchy denial, idempotent callbacks, lost code response, saved-response recovery, exclusive refresh, restart uncertainty, revoked completion, same-account recovery, provider expiry validation and publication generation races. Root separately reports five desktop loopback/IPC tests passing.

Root acceptance remains: deploy the control plane with the registered configuration, restart the exact native app to load its new IPC handlers, reconnect the existing Cloudflare account through the browser, confirm account ID preservation and renewable metadata, then exercise native publishing and a genuine renewal when due. This agent has not claimed live renewal success. API tokens are replaced explicitly; expired or revoked OAuth grants require a new consent flow. A process failure after the provider rotates a token but before the response is durably stored requires reconnection, because OAuth does not provide safe secret retrieval for that lost response.

Root live checkpoint (2026-09-05 UTC): created a genuine private ConvexPress Desktop OAuth client in hybrid5studio through the signed-in Cloudflare dashboard (client ID 3c25bd5ef5be2f8be85b69679f00963d). Registered authorization_code + refresh_token, code response, None (PKCE), and http://localhost:47123/hosting/cloudflare/callback. Saved scope modal proves workers-scripts.read, workers-scripts.write, account-settings.read, offline_access. Public visibility/domain verification is not configured yet.

Deployed the control-plane implementation with TypeScript enabled and set its three OAuth configuration variables. Built the desktop bundle and restarted only the owned hardening Electron process, now PID 36783. Actual native Hosting accounts → Reconnect → Connect with Cloudflare opened the genuine consent page; selected hybrid5studio only and verified all four scopes. The loopback callback completed, and the native panel now shows Connected with Cloudflare / automatic renewal. Authoritative hosting account readback preserves account n974kdf3bq36483hhqbjm2bzqx8dvwaf with revision 3, OAuth credential generation 1, ready, expiration 1788587572216. No access/refresh token was emitted into artifacts or copied from Wrangler. Evidence: output/aster-house/site-run.json and cloudflare-oauth-connected.png.

Root desktop additions: IPv4-only localhost callback listener, strict Host/path/method/state/code validation, single attempt, timeout/cancel/window destruction cleanup, configured control-plane origin validation, exact Cloudflare authorization endpoint allowlist, IPC sender protections and safe errors. Seven tests / 22 assertions pass including actual loopback traffic and dev/packaged sender checks; Electron and preload TypeScript plus Electron bundle build pass. Actual provider token renewal on expiry and subsequent publishing still need live acceptance; successful first consent does not prove renewal.
