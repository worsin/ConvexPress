# Native editor recovery and publication — 2026-10-06

A bounded native journey passed on Admin commit `07c431e2` and Website artifact `output/customizer-palette-shop-20261006/website-dist` (product code `e7ec5dcc`). This is not the complete frozen-candidate Task 8 gate: template switching, Customizer, deliberate conflict/session interruption, final shared-dependency reconciliation and target customer authentication remain separate.

## Observed workflow

The owned Electron Acceptance.app used the existing Admin runtime at 4105, the disposable source backend at 4860 and an owned actual Website runtime at 4322. The fixture was `g1829a48vpyg51kd4f9vyr7ahs8fs31s`, Integrated editor acceptance.

1. Inserted Core's Three guiding ideas pattern through native Patterns, yielding a Section containing Feature Grid plus the original Heading. Saved as revision 4.
2. Restored revision 3 as revision 5: the section disappeared and the actual Website iframe showed After edit automatically. Restored revision 4 as revision 6: the full section returned automatically. Neither operation used Reconnect.
3. Moved the section above the heading, undid and redid the move. Left through the actual unsaved-navigation confirmation and reopened through Pages search. The recovered private draft retained Section/Feature Grid before Heading; both the recovery notice and actual iframe content were observed.
4. Saved recovered content as revision 7. Normal authorized API readback confirms root order `core/section`, `core/heading` in `recovered-saved-document.json`.
5. Published through native review and confirmation. Native status became Published. The separate public Website page contained the section, all three feature descriptions and the trailing heading in that order. `publication.png` was inspected; it shows the main heading and feature cards, with lower content outside the viewport. Accessibility evidence establishes the trailing heading, not this partial screenshot alone.

Evidence directory: `output/native-integration-20261006/`; recovery and publication native AX receipts, saved canonical document, public screenshot, runtime identities and cleanup receipt are retained.

## E99 boundary

Source inspection did not establish a lifecycle cause. These two native restores and subsequent recovery/save/publication did not reproduce the mismatch. No speculative source patch was made. Retain the original intermittent observation as a final integration watch; do not repeat identical successful restores as a substitute for closing other work.

## E18 correction

A read-only live target function-spec query now confirms all four previously missing functions: drafts get/save/discard and draftMaintenance cleanup. `target-functions-current.json` and `target-draft-parity.json` record this. The September 29 absence is historical, not a current target blocker. This does not prove target Clerk configuration, customer provisioning or full source/target artifact parity; those remain open.

## Preservation

Restored native Live selection and observed control-plane signout. Recoverably trashed only the owned page. Exact comparisons preserved all 71 original source/target pages, appearance identity/values, general/reading settings and menu locations. Both owned API sessions were revoked and refresh returned 401. Owned Electron 7217 and Website 7218 stopped; private native profile removed; port 4322 has no listener; all seven protected processes remained alive. No product source changes, user checkout integration or push occurred.
