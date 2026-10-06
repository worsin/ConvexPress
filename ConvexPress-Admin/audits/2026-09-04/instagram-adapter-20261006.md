# Instagram adapter implementation — 2026-10-06

E98 now has an implementation: configured Instagram professional accounts can use the existing social source, refresh and public cache pipeline. The native Social feeds form selects either declared provider. This is a local implementation checkpoint, **not live Instagram acceptance**. Social Feed remains In progress and the tracker remains 130 Verified / 7 In progress.

## Behavior and configuration

The adapter uses the Instagram API with Facebook Login at the fixed `https://graph.facebook.com` origin. The configured professional account ID is checked against the returned profile ID and normalized username; each media owner must match. Requests use an Authorization bearer header, never URL credentials. It fetches at most two pages of 25 records and returns at most 48 posts, reconstructing pagination from bounded cursors instead of following provider URLs. Captions remain literal text. Images, video thumbnails and carousel cover images require an explicitly approved HTTPS media origin. Invalid identities, duplicate IDs, invalid timestamps and foreign post links fail closed. Existing transport timeout, response-byte limit, redirect refusal and scrubbed failures apply.

Per-deployment operator configuration:

- `CONVEXPRESS_INSTAGRAM_ACCOUNTS`: JSON array, at most 20 entries. Each entry has `handle` (normalized lowercase username), `userId` (professional account numeric ID), `accessToken` (existing authorized provider credential), and `apiVersion` (explicit supported `vN.0`). Duplicate handles or IDs, malformed headers and invalid versions are refused. Do not place this value in source control, shell arguments, screenshots or block content; provision through the deployment's private configuration channel.
- `CONVEXPRESS_INSTAGRAM_MEDIA_ORIGINS`: JSON array of exact approved HTTPS origins, at most 20. Default is empty; posts remain available without images until the account's actual media origins are approved. No wildcard or response-directed network authority is granted.

The native content administrator then selects Instagram, enters that configured handle, enables the source and refreshes it using normal site permissions. The form keeps failed drafts. It does not collect tokens. Private credential provisioning is deployment configuration in this patch; native operator credential management and live provider verification remain explicit E98 work. No token or account metadata was provisioned during this checkpoint. Tests use a fake version and fake token, not a claim about Meta's newest supported version. API path basis: [Meta's official Instagram collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-1ff01566-3509-48bd-a0f4-8571a91ccfdf).

## Verification

Artifacts: `output/instagram-adapter-20261006/`.

- 28 backend social-feed tests / 215 assertions pass. These include configured account validation, fixed request authority, owner checks, bounded pagination, closed DTOs, Mastodon regression coverage and a registered Instagram create/refresh/read sequence with synthetic provider responses.
- The registered sequence rejects anonymous/customer management and refresh before any provider request, retains approved Instagram images, strips them when their allowlist is removed, withdraws all posts when account configuration is removed or the site deployment changes, and withdraws disabled sources. No credential is present in public results, inventory or stored source cache.
- The image assertion initially failed because public reads applied Mastodon's allowlist universally (`cache-red.log`). `read.ts` now selects the provider's allowlist and the test passes (`backend-green.log`).
- Mounted React form test passes: selected Instagram provider is sent to the mutation, refused configuration preserves username and enabled state, successful connection resets the form, and losing permissions removes the form. Mocked responses are identified as test evidence, not live provider acceptance.
- Backend and Admin TypeScript checks passed.
- Actual isolated Electron Admin on the disposable staging site displays the new selector, Instagram username field and operator-authorization guidance. `native-form.png/txt` records the editable draft and unchanged existing Mastodon source. No Connect submission was made against the still-previous backend deployment.

Normal native signout observed, original Live environment restored, owned PID 85816 stopped and private profile removed; seven protected processes remain alive (`cleanup.json`). No provider credentials, site content or existing social source were changed. No backend deployment or push.

## Audit decision

Audit 53 correctly identifies the missing Instagram adapter: accept E98. Adapt its block attribution: UGC's consent/moderation lifecycle is separate from Social Feed; the latter remains In progress. Reject removing the declared Instagram option to reduce delivery scope. Presence/count spot-checks are not independent runtime approval. Next: complete the private operator configuration boundary and deploy to the isolated test site, then verify an actually authorized provider. Independent synced-content, migration and integration work continues while provider prerequisites are resolved.
