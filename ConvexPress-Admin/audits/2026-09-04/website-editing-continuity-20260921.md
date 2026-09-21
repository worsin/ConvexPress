# Website editing continuity — September 21

This increment adds desktop-mediated renewal and same-tab reconnect for an explicitly launched Website editing session. It does not close HB1 or change the eight accepted/sixteen open original audit requirements.

## Implementation

An ephemeral loopback listener is bound to the owning Electron window, an exact public origin, a random in-memory ticket and an immutable site/environment target. It exposes only renewal/end, with body, concurrency, timeout, rate and lifetime bounds. The browser receives a one-use handoff, never the controller session. Every renewal obtains fresh authorization through the existing controller broker; the Website redeems against its configured backend and verifies the returned principal and instance. Desktop logout/navigation/window destruction and explicit end close the connection. Reload, desktop restart and the eight-hour ceiling require another explicit launch; private drafts remain the durable option.

Website token access keeps a stable callback so Convex does not clear an already accepted auth context during same-owner renewal. Its own token-refresh requests join desktop renewal near expiry. Failed renewal cannot extend expired authority; the existing tab-local recovery copy is retained and the visible reconnect action retries in that tab. A different returned principal is rejected. Ending cancels obsolete responses and confirms dirty-draft discard.

The Customizer now waits for the published baseline before exposing editable fields. Previously, an edit made while that initial query was pending could be overwritten by initialization.

## Regression evidence

- The real Convex React authentication provider reproduced one clearAuth and a second editor mount on renewal before the callback repair. The repaired regression verifies stable DOM/mount count, current token delivery and forced token refresh. This test uses the real provider with a simulated backend acknowledgement; live browser evidence is recorded separately.
- Real panel regression reproduced editable fields before initialization. The loading guard now passes delayed-baseline and subsequent edit preservation, alongside recovery/history/conflict cases.
- Final Website scoped suite: ten outer tests/52 assertions, including isolated session/provider/panel subprocesses. Internal cases are not additional outer tests. Failure/retry, account mismatch, expiry, stale response and recovery checks pass.
- Desktop listener/actual IPC suites: five outer tests/30 assertions. Exact Origin/Host/ticket, body bounds, rate/concurrency/timeout, wrong native frame/window, cancellation and closure pass. Admin provider/link tests: three outer tests/five assertions; immutable target and logout during mint are covered. Backend handoff suite: six tests/38 assertions, including authenticated principal in the response.
- Website and Admin types, Website production build and focused lint pass. Earlier desktop build/types and strict isolated backend deployment are retained in the run evidence. No remote CI or public HTTPS compatibility is inferred.

## Live acceptance status

See `output/website-editing-continuity-20260921/` for deployment, QA inventory and current browser receipts. The first connection was already closed when observed; its cause was not established. A traced subsequent native launch survived a desktop environment switch and renewed against the original source, but the old Website bundle remounted the editor. An attempted rerun only changed the URL fragment and kept that old bundle loaded; it is not evidence for the fix. The final run explicitly reloads and verifies the compiled asset before testing.

Final-build natural renewal passed: exact loaded asset main-CXy7mTSi.js; observed318612ms after starting, more than31seconds beyond the original token expiry; a fresh source-environment handoff was redeemed while the native window remained on Live. The same Customizer DOM and unsaved #274b83 value remained, with no captured page errors. Actual Undo/Redo and inspected desktop/mobile screenshots pass;390px viewport has no horizontal overflow. Exact published appearance and all42 page records are unchanged. A separate injected loopback failure plus client-clock/focus expiry hid the editor; the actual Reconnect editing button restored the same-tab value and history after transport recovery. End cancellation retained the draft; confirmation removed the editor and closed the listener. Native logout closed a second real listener (preflight204 before, connection refused after). The initial logout locator used the wrong button name; the actual signed-out heading and closed listener independently confirmed success. Synthetic API logout returned200, the owned browser/Electron closed and the isolated private profile was removed. No server clock manipulation or durable draft/content save occurred. The OS external-browser opening boundary is intercepted only to direct the native-generated launch into an owned real Chromium window; it is not a new default-browser launch acceptance.

All four original application/renderer/demo/tunnel processes remain alive; only the owned preview and forwards were stopped. One existing MagicTables Features Notes update was dry-run and read back against all15 rows; all status/completion fields are unchanged.

## Remaining scope

Public HTTPS/local-network-permission acceptance, all packs/contextual fields, real customer denial and live controller revocation remain required for full HB1. Browser closure/reload loses tab-memory recovery. No full block/template or release acceptance is claimed. Dashboard "Customize Your Site" currently routes to General settings; repair and rendered verification remain a concrete navigation follow-up.
