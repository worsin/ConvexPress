# Generated plugin: customer authentication and embedded preview

September 20, 2026. These two acceptance milestones passed against the generated Community Events installation on disposable staging `http://192.168.1.246:4860`. They do not establish full HC2, all-block, cloud-hosting, packaged-release, or production-auth acceptance. A05 and B08 remain the only fully accepted original audit items.

## Actual runtimes and source identity

- Owned Electron process 56330 loaded the generated Admin fixture on port 4335 and the real control plane on 4720.
- The generated Website ran at the staging environment's registered origin, `http://127.0.0.1:4322`. The prior test used 4336, which did not match the environment's preview binding. No origin restriction was weakened.
- The Website and Admin fixture files for DashboardPage, RegisterForm, useEnsureCustomerAccount and NativeSavedPreview match the current worktree byte-for-byte. Their hashes are recorded in `output/extension-customer-20260920/preservation.json`.
- The Clerk issuer was deployed from the already sealed generated backend snapshot. Strict typechecked deployment succeeded in 45.79 seconds; all 1,628 snapshot files remained unchanged. No other site backend was deployed. This used the CLI with environment credentials and a private input file; the native Apply-and-redeploy button is not accepted by this evidence.

## Embedded editor preview

The existing draft RSVP page, revision 5, was opened in actual Electron. Its Website iframe completed the authorized handshake and rendered the unavailable-event state while the generated plugin was disabled.

Through the real editor controls, a Heading block was inserted and edited without saving. The text rendered in the live Website frame while the complete stored document remained equal to its baseline. Desktop and mobile controls worked; the mobile frame measured 388 CSS pixels internally with no horizontal overflow. Reconnect preserved the unsaved draft. Saved preview correctly remained disabled while the draft was dirty. Removing the unsaved block returned the editor to All changes saved; saved preview and a full reload then showed only the original document. No page errors occurred. The mobile preview image was visually inspected.

This proves the origin/handshake and unsaved-content boundary for the tested document. It does not establish every block's live resolver or every template's preview behavior.

## Real customer flow and authorization

The native Clerk integration created one temporary, unclaimed development application. Backend readback confirmed its secret was stored, its named Convex JWT template was configured, and the deployed issuer matched. The application was not recreated when the automation's action-response observer timed out; live readback reconciled that result.

Registration remained invitation-only. One Subscriber invitation was created using the authorized registration mutation with `sendNotification: false`; its token stayed in private storage. The customer used the actual Website signup form and Clerk email-code verification, then arrived at `/dashboard/community-events/` with the real generated event rendered.

Clerk's development testing-token method and its documented CAPTCHA bypass response flag were used for browser automation. Authentication responses, users, sessions, JWTs and Convex queries were real. This is explicitly **not live CAPTCHA acceptance**. Reserved `+clerk_test` email/code behavior avoids sending a verification email. References: [Clerk testing](https://clerk.com/docs/guides/development/testing/overview), [test emails](https://clerk.com/docs/guides/development/testing/test-emails-and-phones), and [official Playwright helper source](https://github.com/clerk/javascript/blob/main/packages/testing/src/playwright/setupClerkTestingToken.ts).

The resulting JWT had the expected Convex audience and verified-email claim. It resolved the authenticated profile query for the invited customer and was denied the administrative Clerk configuration query. The invitation was consumed. The same token could not retrieve a customer profile from the separate live database on 4870.

The generated Dashboard rendered on desktop and 390-pixel mobile without horizontal overflow. Both screenshots were visually inspected. Disabling Community Events through native Electron removed its navigation and replaced the customer's already-open page with Page Not Found. Re-enabling it restored the event without a page reload. No page errors occurred during those transitions.

The customer signed out through the account menu. A protected deep link redirected to login with its return path preserved. A second actual password sign-in created a different Clerk session, resolved the same protected profile, and loaded the generated event again.

## Preservation, cleanup and retained configuration

- Customer signed out after the second run; the owned Clerk test user was deleted and its site-local record deactivated. The accepted invitation/audit history remains.
- The original event's complete editable fields were restored and it is archived. Plugin settings match the baseline except expected update timestamps.
- Before/after private exports prove all 45 existing post/page documents unchanged, with no additions or removals.
- The native operator signed out; the exact temporary controller trusted-origin change was restored; owned Electron, browser and Vite processes were stopped. Original Electron 39198, Admin 69634, SSH 68390 and BlockDemo 8172 were confirmed alive.
- The disposable staging site intentionally retains its Clerk development connection, matching issuer environment variables and control-plane publishable-key configuration for further acceptance. Claiming the app, configuring production auth/webhooks, and live CAPTCHA remain open. No billing or DNS changes occurred.
- MagicTables Standalone Roadmap received one Features Notes update after live schema discovery and a zero-create dry run. Readback across all 15 feature rows confirmed every other cell and completion flag unchanged.

## Evidence and limits

Local receipts are under `output/extension-customer-20260920/`: `preview-result.json`, `customer-result.json`, `customer-repeat-login.json`, `auth-deployment.json`, `cleanup.json`, `preservation.json`, `native-signout.json`, `mt-verified.json`, and the reviewed screenshots. Credentials, claim URL, invitation token and raw provider configuration remain outside the repository.

This pass changes acceptance evidence and disposable-site configuration, not product source. It does not add to earlier unit-test totals. Several automation attempts needed correction: accessible names differed from visible text, some controls intentionally remained disabled, selector scopes were ambiguous, and signup fields were filled before provider initialization finished. Those attempts are not passing tests or product repairs; the successful final receipts are the scope of the claims above.

Remaining work includes broader authored-page/template/kit workflows, all-block visual/motion/live-data acceptance, production providers and webhooks, clean-machine packaging, original production gates, and safe integration.
