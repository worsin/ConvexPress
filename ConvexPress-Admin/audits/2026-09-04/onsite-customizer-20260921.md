# On-site operator Customizer — September 21

The desktop can now open an authorized Website editing session while leaving Clerk customer identity separate. Core private-draft and reviewed-publication workflows passed on the isolated staging database. The production goal remains incomplete: eight original audit rows accepted, sixteen open; full block/template/handoff acceptance remains open.

## Changes

- Added a desktop Customize on website action. The backend receives only a SHA-256 digest of a random one-use secret, binds it to the installed website/environment and public origin, and rechecks the current operator before redemption. The link expires after sixty seconds; bounded pending rows have scheduled cleanup.
- Added the Website exchange, separate in-memory Convex operator provider, explicit end control and expiry notice. No operator token enters browser storage or Clerk. Repeated React effects share one exchange; same-tab links can reopen editing, and obsolete exchange responses cannot restore an older session. Authenticated subtrees remount on authority changes.
- Reused the existing local/management JWT providers. Management authority remains bound to the parent session and capability ceiling. Website tokens expire within five minutes or the earlier parent deadline.
- Distinguished network failure from expired/refused authorization. The actual default Chrome reported ERR_ADDRESS_UNREACHABLE for the private Linux worker; the owned preview subsequently used loopback SSH forwards. No global browser/network configuration changed.
- Shared template activation logic between Website and generated Admin mirror, preserving each pack's saved shop variants and previous legacy selections. On-site publication now removes its reviewed saved draft, preserves a concurrently changed draft, and includes a template-only switch in review. Public Convex conflict messages take precedence over generic transport errors.

## Observed acceptance

- Real worktree Electron PID5662, isolated synthetic-operator profile, existing renderer4105. Native Customize on website opened Google Chrome at the clean4322 URL with operator notice, toolbar and Customizer. Chrome's separate open draft subsequently displayed a competing-publication conflict and disabled review.
- Actual local and management handoffs succeeded. Consumed-link replay returned403. Wrong-origin redemption returned403 without consuming the code; two concurrent valid requests returned exactly200/403. The resulting token was denied by independent live4870; anonymous handoff creation was denied.
- Through real Website controls: Core primary-color draft save left published values unchanged; close/discard, load saved draft, Undo/Redo, review and confirm publication passed. Backend readback matched the published color and the owned saved draft was removed.
- A competing publication preserved the open unsaved draft and disabled stale publication. Explicit end removed operator controls; reload did not restore operator authority. Final-build same-tab reopening scrubbed the fragment and opened the panel.
- Desktop1440 and mobile390 screenshots inspected. The mobile panel fits384×844 inside390×844, with no document overflow and visible close/review controls. These are Customizer fit checks, not whole-site aesthetic acceptance.

## Validation

- 64 auth tests/341 assertions passed, including six handoff tests/37 assertions. These registered-handler tests cover customer/no-capability/inactive-role denial, expiry, installation changes, password/user/role changes, parent management revocation, bounded pending links and HTTP signing.
- 12 scoped Website tests/44 assertions passed at the checkpoint, including an isolated React lifecycle wrapper whose four internal cases cover repeated effects, customer restoration, failure, expiry and newer-link precedence. Four Admin helper tests/13 assertions passed.
- Backend and both consumer types passed; both production builds passed with existing bundle-size advice. Generated contracts:2286 functions/3037 DTOs,375 disclosed existing unknown boundaries. All36 API compiler fixtures per consumer passed, including client-supplied authority and public-redemption rejection. Scoped lint: zero warnings/errors in13 files. Template mirror and77 kit-file checks passed.
- The first strict deployment failed after regenerated bindings exposed recursive type inference. Explicit registered-function and return types repaired the boundary; strict regenerated-deployment types and the second push passed. Type checking was not disabled. The source snapshot retains the generated test extension graph and the preceding storage-inclusive backup.
- Initial browser harness issues are not product failures: one click was blocked by the already-open panel, one assertion read before React settled, and a same-document navigation initially retained the old process runtime. The repeated-link handling itself was added and tested explicitly. No failed check is counted as acceptance.

## Preservation and limits

Exact original appearance/general values,42 pages and2 posts are restored/unchanged. The owned native operator's Core draft was absent initially and removed after publication; pre-existing API-user drafts were not overwritten. No customer account, content or media fixture was created. Native/API sessions signed out; owned browser, Electron5662, Website20800 and SSH13055 stopped, private native profile removed. The handoff table is empty after scheduled cleanup. Original Electron39198, renderer69634, BlockDemo8172 and tunnel68390 remain. MagicTables: two Features Notes-only updates; dry-run/preapply and all15-row readback verified, completion fields unchanged.

Full HB1/HB2/HB3 are not closed. Remaining: every pack/contextual field and header/footer/menu workflow, live signed-in customer denial against the new endpoint, live parent-revocation display behavior, and long editing sessions. The current five-minute session requires reopening; uninterrupted editing and preservation of unsaved drafts through expiry must be completed before production signoff. Existing Website admin links also require native-app routing before a production handoff. No hosted/cloud on-site acceptance or universal motion claim is made.

Evidence: output/onsite-customizer-20260921 contains deployment/backup receipts, checks, live-auth.json, live-security.json, native-browser-launch.json, workflow.json, conflict-and-end.json, restoration.json and inspected screenshots. Cleanup/integration and MagicTables receipts record the final batch state.
