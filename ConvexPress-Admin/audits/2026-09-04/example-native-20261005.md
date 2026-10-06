# Four authored sites: native editing and published navigation

2026-10-05, hardening worktree. Task 6 / E10 remains open for full responsive site/chrome review and the remaining all-block demo/pattern requirements. This batch verifies representative native authoring across all four packs, not every block.

## Native evidence

Actual Electron 33.4.11 ran from an owned copy of the installed app with a private acceptance profile and the existing Admin development server at 4105. User Electron PID39198, Admin PID62672 and BlockDemo PID65092 were preserved. Normal synthetic operator sign-in; isolated site sessions came through the control plane.

| Pack | Authored page | Revision before → after |
|---|---|---|
| Core | A studio built around useful work | 6 → 7 |
| Journal | An independent point of view | 4 → 5 |
| Depot | Fewer things, better understood | 4 → 5 |
| Aster House | A house for time together | 5 → 6 |

For each page, edited the Hero body through native controls, observed private draft autosave and the new text in the actual Website iframe, selected Mobile, saved, reloaded, and verified exact persisted text. Authenticated canonical readback compares the full tree with its baseline: only the intended body changed; each revision increased once; status remains publish. Portable recipes carry the same copy.

Core additionally proves that the published revision/tree remains unchanged while the private draft is unsaved, actual preview click-to-select changes native block selection, and Reconnect restores the current Website draft. Public Website checks confirm all four saved copies. All 13 distinct authored CTA destinations resolve to HTTP200, including supported bare-page redirects; no speculative URL rewrite was needed.

Evidence: `output/example-native-20261005/before.json`, `{core,journal,depot,aster-house}-after.json`, `core-unsaved-proof.json`, four `*-unsaved-mobile.png` screenshots, `links.json`, `aster-published-view.png`. A native input automation attempt initially dropped a letter in Core; exact paste corrected it before Save. No app text-loss claim follows from that one input attempt.

## E72: published list actions used the Admin router

1. Required workflow: open a published authored page/post from the native content list.
2. Evidence: native Page list exposed `4105/#/the-house`; Post list source used the same relative-link pattern. Detail editor already correctly linked to Website4328.
3. Dependency: both list builders supplied relative paths; shared InlineActions always used the Admin router Link.
4. Repair: reuse the existing selected-environment URL resolver and canonical page/post path helper; hide View without a valid Website URL; render public actions as a separate anchor with noopener/noreferrer. Internal Edit actions remain routed normally.
5. Exit: real native Aster list exposes `4328/page/the-house`; clicking View opens the system browser on that page with the saved copy. Post list exposes `4328/blog/an-unplanned-hour`. The owned opened browser tab was closed afterward.

Rendered real-router regression fails before the anchor repair and passes afterward. Existing URL tests cover nested paths, selected staging identity, missing/invalid origins and copied settings isolation. An intermediate typecheck caught siteOrigin in the wrapper rather than ScopedPostListTable; it was moved to the actual consumer and the final check passed.

## E73: first-origin reload could restore the previous site

1. Required workflow: switch between example sites once and retain the requested site through Electron connection-policy preparation.
2. Evidence: initial Core/Aster selections fell back to the preceding site after reload; Journal/Depot exposed Continue opening. Repeating selection worked, so this was not a missing site or permission.
3. Dependency: StandaloneApp used pendingSelection immediately, which started SiteRuntimeProvider network registration/reload before awaited setActive and synchronous per-window commitSelection completed. Reload then restored the prior per-window selection.
4. Repair: runtime/shell selection uses committedSelection. Pending selection still tracks the operation, but the new runtime is exposed only after the server preference succeeds and window storage is updated. Existing route-leave guard, generation checks and server authorization remain in force.
5. Exit: stopped only owned Electron4122; backed up and removed only Journal origins from its private profile allowlist; restarted owned Electron5968. One Aster→Journal selection registered both previously absent origins, completed reload and remained on Journal with Connected database. No second selection or Continue action. Evidence: `journal-first-switch-after.txt` plus origin readback.

This is a native before/after race reproduction, not a claim that all possible switch/session failure modes were newly tested. Existing scope cancellation/supersession and independent-window persistence tests also pass.

## Validation and cleanup

- 9 focused Admin tests / 37 assertions pass: rendered InlineActions, selected Website URLs, route-leave guards, independent window persistence.
- 5 recipe tests / 83 assertions pass.
- Admin TypeScript check passes after both repairs. No whole-repository green claim or final common production artifact claim.
- Script-owned site API sessions revoked with refresh401 checks; native operator signed out to the sign-in screen.
- Restored original Promotion Lab Website / Live — disposable (4870) selection before sign-out. Both owned native processes stopped; original three protected processes remain running. Four Website preview processes retained.
- Latest Claude audit remains40, already reviewed. No new deep audit was present. No push, backend deployment, new order, form submission or original content mutation in this batch.

Next: full four-site narrow/wide chrome and visual review, then outstanding Task5/7/8 delivery gates. Media-index capability banners need a bounded compatibility check if they block editing; no unsupported broad backend-upgrade claim.
