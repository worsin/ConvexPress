# Journal and Depot Customizer acceptance — September 21

Journal and Depot pass the recorded native draft, publication and staging-to-live settings workflow on two independent databases. Three observed defects were repaired. The original production audit remains **eight accepted / sixteen open**; full handoff and block/template acceptance remain incomplete.

## Repairs

1. A fresh Electron document allowed staging but blocked its separate live database with CSP. Network preparation now includes the registered live backend of the selected staging website. Exact HTTP(S) origins only; credential-bearing addresses rejected; broker/backend authorization unchanged. Native promotion failed before and completed afterward without CSP errors.
2. Stale promotion correctly failed, but the Customizer displayed only “Server Error.” Save, publish and promotion now use the existing public-error extractor. Native refusal explains the conflict, preserves newer live settings, and allows recovery through a fresh review.
3. Activating Journal after Depot retained Depot's global shop variants. The editor showed Journal's classic product layout while the website fell back to split. Activation now restores the destination pack's saved shop selections and preserves legacy-only selections before leaving their pack. Unrelated settings, surface overrides and variants remain intact. Actual Journal output is boutique/classic after Depot marketplace/showcase, matching its controls.

## Observed workflow

- Real worktree Electron PID74202, isolated profile, renderer4105. Promotion Lab staging4860/live4870 have different instance identities and the same website identity. Production Website builds ran on4322/4321.
- Journal Rosewood/Lora/Inter/rounded and Depot Signal/Space Grotesk/Inter/pill; changed type scale, width/spacing and shop controls. Group reset/Undo, brand reset preserving unrelated fields, Undo/Redo, save/reload/load draft passed for both. Source and target published snapshots remained unchanged before each draft publication.
- Both published through native controls and promoted only after explicit live confirmation. Complete target appearance values matched the reviewed source; identities remained distinct. Journal stale-review rejection preserved newer live values; fresh review recovered.
- Actual Website1440/390 screenshots inspected for both promoted packs: matching palette/font/radius, no horizontal overflow. Loaded Lora and Space Grotesk faces observed. Native source shop preview used existing real products for Journal boutique/classic and Depot marketplace/showcase. Target home has no published posts: its screenshots prove the promoted shell/settings, not a complete content-rich website.
- Native switching retained each pack's settings. Successful publication removed owned saved drafts; pre-existing API-user drafts were preserved.

## Validation and cleanup

- 491 Admin frontend tests/1971 assertions pass, including origin-selection and template-switching regressions. Fifteen focused tests/45 assertions pass. Admin TypeScript, production build, eight-file Oxlint and diff checks pass. Build retains bundle-size advice. An initial ESLint command used an unavailable toolchain; the completed lint check is Oxlint.
- Both exact baseline appearance values and general settings restored. Exact page/post comparisons pass: source42 pages/two posts; target28 pages/one post. No content/media fixtures created. Native operator signed out; both owned API refresh sessions logged out; private profile/session files removed.
- Closed owned Electron74202 and Website74145/74170. Original Electron39198, Admin69634, BlockDemo8172 and tunnel68390 remain live.
- MagicTables: Notes-only updates on Environment Clone and Promotion and Complete Template-Aware Block Library, with dry-run, unchanged preapply snapshot and full15-feature readback. Completion fields unchanged.

Artifacts: `output/customizer-packs-20260921/` contains draft/promotion/conflict/switch receipts, screenshots, restoration/session/process receipts, check logs and MagicTables snapshots. Original content baselines remain private.

Remaining: on-site authorized Customizer, other packs/fields, header/footer/menu modules, every signed-in surface, complete example websites, full block/live-data/design/motion and production acceptance. These results close the named Journal/Depot workflow cases, not HA1/HB3 in their entirety.
