# Native canonical editor and Website preview integration

September 5, 2026. Source is wired to the actual six `api.canonicalDocuments` exports: `get`, `initialize`, `save`, `restore`, `pageRevisions`, and `pageOptions`. Backend ownership and handler acceptance remain in `canonical-checkpoint-a-contract.md`. No live content, deployment or browser operation was performed by this frontend agent.

## Native authoring flow

Existing page/post edit routes expose **Open block editor** for drafts. An existing v2 document opens this editor directly. Ordinary legacy editing is preserved; the canonical server decides whether an existing document is eligible. **Use block editor** initializes only an eligible empty draft with its exact revision and backend-provided authoring digest, then reads its authoritative policy before offering blocks. No nonempty legacy conversion is attempted.

The editor uses generated definitions, full-tree validation and installed renderer metadata. It supports title and generated attribute editing, adding root/nested blocks, selection and removal, scoped page/media pickers, explicit save, conflict retention and revision restoration. Unsaved invalid fields remain visible and block save. Existing layout, anchors, marks and lock fields survive edits. Locked edits/removals are refused in the frontend and backend; removing a container cannot silently remove a locked descendant. Unavailable resource kinds remain explicitly unsupported rather than being changed to a guessed ID.

Writes use compare-and-swap revisions and validated content digests, then explicitly reopen the document. Revision browsing retains bounded continuation, shows which historical formats can be restored, requires confirmation, and restores as a new revision. The generic editor's draft remains intact when a newer remote revision arrives; discarding local changes is explicit.

The native verified-runtime context contains target identity, operator identity and client generation, never a token. Same-instance connection, Website address, operator, broker-selected role, retry or runtime generation changes clear the old editor before effects can reuse it. Picker results are cancelled on scope/revision change or unmount. Media resolves through the existing authorized media API; page references use the new bounded current-document-scoped `pageOptions` API.

A local lifecycle regression caught UUIDs beginning with a digit, which violates canonical block IDs' letter-first rule and disabled Save intermittently. IDs now have a `block_` prefix; a deterministic digit-leading UUID case verifies the full generated parser. The initial failure is retained in `/tmp/canonical-native-combined-tests.log`.

## Actual Website preview and freshness

The Website route is **`/document-preview`**, with no draft loader and noindex metadata. Top-level use is neutral. A receiver listens only when its direct parent matches the exact server runtime `adminAppUrl`; the parent cannot be selected through authored attributes or URL parameters. Root configured staging with `CONVEXPRESS_ADMIN_APP_URL=http://127.0.0.1:4105`. Packaged origin support is exactly `convexpress-app://shell`, checked against the actual desktop protocol constants; actual packaged `event.origin` proof remains pending.

The native-owned iframe receives only a closed decoded document/data/media DTO plus native viewer generation through the bound MessageChannel. It uses the actual installed Website pack, shared production block renderer, real template tokens and reference-data display store. There is no demo adapter, customer-role shortcut, new issuer, general bearer, local storage credential or form submission transport. An uninstalled/mismatched pack refuses display. Data stores invalidate on replacement/unmount, and known source/revision/policy changes immediately unmount the captured preview.

The display lease is at most five seconds. Each renewal requests a **new authenticated server execution** using `get.refreshKey`, at most one in flight; its deadline starts when the request starts. This matters because the installed `ConvexReactClient.query` returns `watch.localQueryResult()` for an existing subscription. Reusing that cache cannot prove renewed permission. The bounded optional refresh key has no authority meaning and is server-validated. Failed, late or mismatched responses stop renewal. Offline revocation is bounded by this lease, not claimed instantaneous.

The exact preview route is also reserved by the shared page-route policy; existing colliding content is not silently renamed.

## Restore-induced native session recovery

Root's real same-environment restore intentionally cleared management-session rows. The old JWT still passed websocket signature authentication while `users.checkAdminAccess` returned null. Previously the native gate offered only Sign out and held the revoked session indefinitely.

The gate now performs one ordinary broker/client reconnect per unresolved target/operator recovery chain. Creating another client does not reset the automatic retry budget. Verified site access resets it for a future restore; a genuine repeated denial remains denied and offers an explicit **Reconnect site session** action. Managed token-verification failure no longer signs the operator out of the control plane automatically. No permissions were changed and no authorization shortcut was added.

**Root live proof:** the existing Electron window automatically returned to Aster staging Posts with its three existing published posts, without reload, sign-out, role change or a click. Media navigation worked. Evidence: `output/aster-house/backup-capacity/native-session-recovered.png` and `acceptance.json`. This is recovery acceptance, not yet canonical authoring acceptance.

## Final source gates and next live check

- Admin consumer TypeScript passes: `/tmp/site-session-recovery-types2.log`.
- Website consumer TypeScript passes after the final authoritative mirror refresh: `/tmp/canonical-native-website-finaltypes.log`.
- Native editor/session/recovery suite: **15 test entries passed**,66 outer assertions; isolated real DOM workspace cases cover initialize/add/save/reopen/restore and authoritative validation. The direct workspace fixture separately passed2 cases/31 assertions. Logs: `/tmp/canonical-native-final-alltests.log`, `/tmp/canonical-native-workspace-final.log`.
- Website channel/codec suite: **10 passed,72 assertions**; exact source/origin/bootstrap, generation/tree/revision/scope, expiry, navigation, top-level refusal and packaged constant drift are covered. `/tmp/canonical-native-website-finaltests.log`.
- Reserved-route handlers7/22; actual Website route parity1/1. Scoped lint and whitespace checks pass.
- Full embedded Website import closure: **83 canonical renderer modules, zero forbidden demo/backend-server/Node imports**, no output written. `/tmp/canonical-native-final-closure.log`.
- Portable contract freshness:14 exact authoritative files, no changes. No dependencies upgraded.

Root's next acceptance sequence is to deploy the backend checkpoint and build/publish the Website route, preserve/reapply the reviewed dev parent origin, then use the native editor on a disposable empty draft: initialize, add nested content and rich text, choose actual scoped media/page references, save/reopen, render the actual Website preview, restore a prior revision, verify conflict and authority loss, and clean up the draft. Existing nonempty legacy migration, full composition rearrangement/layout tooling, unsaved preview, canonical publication/promotion and the remaining catalog remain required separate milestones; this source checkpoint does not claim those complete.

## Production Website dependency-resolution repair and artifact

Root's first actual hosting build failed because the root canonical schemas import Zod outside the Website package's node_modules ancestry. BlockDemo and the offline import-closure fixture had explicit installed-package aliases, while the actual Vite config did not. The main config now resolves React, react-dom and Zod from the Website's installed dependencies, deduplicates those shared runtimes, and adds the canonical block source directory to the dev server's allowed paths. Nothing was externalized or upgraded.

The full `node scripts/build-hosting.mjs` production gate then passed using the six allowlisted public staging runtime values in `/tmp/convexpress-staging-public-runtime.json`. Website TypeScript also passed. Artifact:140 assets; Worker4,315,766bytes; SHA256 `d616755ba44fcbb0672dac75a54a1a8c1b26fd700cda00dbbad93ccdc8a5deee`; manifest SHA256 `d6939f4a9d2850d63053616d8f58ac31d3600c480131b844955ee523dd2fa95e`. The worker digest matches the manifest, and all asset sizes match their files. Durable receipt: `output/aster-house/canonical-preview/website-build-receipt.json`; successful log `/tmp/convexpress-canonical-website-build-fixed.log`. Original failing log is preserved. Output is held for root native publication; this agent did not deploy it.

## Published SSR regression and runtime repair (2026-09-05)

The earlier successful dependency-resolution build was not sufficient runtime proof. Root published release `nx72kh530eynj6gdkzd0dvnkbh8dtxpp` and observed Cloudflare 1101 / HTTP500 on the real preview route. The exact bundled Worker reproduced offline: `/document-preview` redirected to `/document-preview/`, then rendering failed with `TypeError: Cannot read properties of null (reading 'useContext')`. The absolute React aliases in Vite caused an in-bundle React dispatcher beside externally resolved `react-dom/server`.

The corrected configuration keeps React/react-dom bare with dedupe and explicitly resolves only Zod for the out-of-package canonical source. No dependency version changes or runtime externalization workaround were introduced. `scripts/check-hosting-runtime.mjs` executes the actual bundled Worker in workerd with all outbound HTTP intercepted locally. It verifies `/` and `/document-preview/` return complete HTML containing their actual component text, checks the three public release headers, and proves top-level preview has no private document. A separate old-publisher case proves absent release/artifact bindings still render and do not invent metadata. Full hosting builds now run this offline runtime gate after bundling; `--skip-build` remains an explicit packaging-only operation.

The wrapper preserves real response status/body and conditionally attaches `x-convexpress-instance`, `x-convexpress-release`, and `x-convexpress-artifact` from public runtime bindings. This supports commerce's separate publisher probe; it does not independently claim provider verification. Current native can publish this runtime fix while the upgraded publisher is pending.

Final local gate: full build and Website TypeScript both exit0; workerd checks pass; scoped diff-check passes. Build log `/tmp/convexpress-canonical-worker-runtime-fixed-build.log`, runtime log `/tmp/convexpress-worker-runtime-regression.log`. Sealed receipt `output/aster-house/canonical-preview/website-runtime-fix-build-receipt.json`: Worker 4,382,494 bytes, SHA256 `c2a95099aa044362ecd4d965458c491fc2517765272c12d6c062893bc8318f2d`; manifest SHA256 `b08c45a93649dd647ebbea54798bddd0e2a6f641397bcd1fcf15221755bd8555`; 140 assets with verified file sizes. This supersedes the earlier build receipt for deployment. Root owns publication and live/native proof; this agent made no live requests.

## Canonical public lifecycle consumer checkpoint — 2026-09-05

Actual native five-block create/save/reopen/restore/Website preview and3769ms offline clearing accepted by root (output/aster-house/canonical-native/acceptance.json). New public all4pack homepage/page/post consumption, native migration review and publication/schedule UI are source-ready. Corrected full hosting+offline workerd gate passes; see canonical-public-consumer-outcome.md and output/aster-house/canonical-preview/website-public-lifecycle-build-receipt.json. Root live public lifecycle acceptance remains pending; source/dist held. Full136 scope and unimplemented legacy adapters remain open.
