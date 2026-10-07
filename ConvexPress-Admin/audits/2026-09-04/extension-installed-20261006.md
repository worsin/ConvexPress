# Generated extension: installed native and customer acceptance

Source: `ef4b3f1152fac114daa3dc3a24153517b12b7995`. Evidence: `output/extension-installed-20261006/`. This closes the remaining generated-extension/native Extensions/customer Dashboard portion of E16 and Task 7. It does not close all SDK operations, actual AI generation, all Dashboard surfaces, or final integrated deployment parity.

## Installed source and checks

The documented CLI generated `studio-events` (title **Studio Events**) in a disposable copy of the current source. The dry run identified 52 files; the write regenerated schema, plugin, search, RSVP, Dashboard, template and route indexes and source-derived API declarations. The extension starts disabled. Its backend namespace is `studio_events`, tables begin `extension_studio_events`, and its plugin setting is `studioEventsEnabled`. The existing Events extension stayed disabled and separate.

- Generated backend: 39 tests, 345 assertions, six files; publishing, categories, pagination, calendar, search and RSVP.
- Generator regression: 9 tests, 159 assertions.
- Admin and Website type checks pass. Website production build and template check pass (four packs, 93 catalog surfaces).
- Generated Website files lint cleanly. The full Website lint command fails on two existing `no-control-regex` warnings in `spec-runtime.mjs:313` and `serve.ts:47`; running the same command against the original source produces the same warnings. No whole-repository lint success is claimed.
- Fresh strict-typechecked backend deployment at `192.168.1.246:4922/4923`: 2,394 functions. Native copied Admin used already trusted IPv6 `localhost:4105`; Website artifact used `127.0.0.1:4331`. The original IPv4 Admin and existing example runtimes stayed running.

The source copy includes required generated indexes and supporting scripts. Its Admin Vite development allowlist additionally permits the original dependency directory linked into this disposable copy. This is fixture setup, not a product change. The copied extension was never added to the shipped catalog.

## Native and public lifecycle

Using the actual Electron window and the normal operator login/site exchange:

1. Studio Events appears disabled in Extensions; its public route returns 404.
2. Native **Enable** exposes its navigation and public empty listing.
3. Native **Add event** creates `Studio Extension Workshop`, slug `studio-extension-workshop`, with description, venue/address and the editor's future start/end defaults. Its draft is absent from the public listing.
4. Reopening the native draft preserves its fields. Changing Status to published and saving exposes the actual Website listing and detail.
5. A second authenticated editor changes the venue to Studio Garden. Repeating the old expected version is rejected with structured `EVENT_CONFLICT`; the public page reacts to the accepted edit and native reopen shows it. This is deployed API conflict acceptance, not a claim of a native two-window conflict dialog.
6. Native cancellation produces the public cancellation notice. Native republication restores the listing.
7. Native disable withdraws the open customer page immediately, public detail returns 404, Admin queries reject `PLUGIN_DISABLED`, and public detail API returns null. Native re-enable plus reload restores public and customer content.
8. The entire event record, appearance snapshot and email settings are identical before and after disable/re-enable. Plugin values are identical except the expected plugin-settings update timestamp.
9. Native archive retains the record as Archived, removes the customer listing entry and returns null/404 publicly.

Event identity: `qh7vrjqfrmd8907xdkqg29st2n8fszpy`. Receipts include `event-published.json`, `concurrent-edit.json`, `event-cancelled.json`, `preservation-before.json`, `disabled.json`, `preservation-after.json` and `event-archived.json`.

## Actual customer Dashboard

The isolated deployment was configured through the normal Clerk connection action using the existing development provider; environment application and strict redeployment confirm the matching issuer. A new disposable development Clerk subscriber signed in through the actual Website email/password and development email-code flow. No authentication mock, CAPTCHA bypass, browser token injection or operator-as-customer substitute was used.

The site profile proves `authSource: clerk`, the expected subscriber role and `adminLoginAllowed: false`. Studio Events appears in both the Dashboard sidebar and quick links. Its real `/dashboard/studio-events` page renders the published event, reacts to disabling, restores after re-enabling and becomes empty after archive. Normal sign-out followed by direct Dashboard navigation redirects to the real sign-in form. This accepts this generated contribution, not all 22 Dashboard surfaces.

Screenshots: `public-published.png`, `public-cancelled.png`, `customer-dashboard.png`, `customer-disabled.png`, `customer-restored.png`, `native-archived.png`.

## Cleanup and scope

Normal native/customer sign-out completed. The synthetic Clerk user was deleted and its retained trial site profile deactivated. API sessions were revoked and refresh denial checked. The original Promotion Lab **Live** selection was restored. The trial connection was revoked, its environment and website archived, and the original website inventory compared exactly. Only trial processes and its container were stopped; the trial database volume remains recoverable. The source was archived before removing the disposable copy and native profile. All protected processes and four example previews remained available.

Archive: `sdk-source-evidence.tar.gz`, 44,320,842 bytes, SHA-256 `857bea72a6d7c20f4aec778a6023105c71ccc9925429e10da51dcc507f3f6d90`.

No shipped plugin, block inventory, existing site database, or unrelated source changed. No push. The overall delivery goal remains active at 117 Verified / 20 In progress; these counts are block rows, not overall completion percentages.
