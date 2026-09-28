# Private autosave conflict routing — September 28

Status: Opus04 F13 reproduced and repaired. Existing E19 acceptance remains valid; this is a bounded follow-through within it. No tracker row changes and no backend deployment.

## Reproduction and decision

The private autosave mutation catch discarded structured error codes. Both a competing private generation (`DRAFT_CONFLICT`) and changed accepted revision (`CONFLICT`) displayed a generic unavailable alert and required manual Retry. The regression test now uses actual ConvexError objects. Removing manual Retry reproduces the missing automatic review (`competing-red.log`); accepted-revision rejection reproduces the generic error (`revision-red.log`).

Codex adapted Claude's recommendation rather than blindly reloading for both codes. A private read cannot establish the current accepted document revision: reloading an unchanged draft generation while retaining the old base could authorize repeated stale writes.

- DRAFT_CONFLICT performs a fresh private read and uses the existing exact-generation/payload reconciliation and explicit review rules. It does not replay the failed mutation.
- CONFLICT pauses private autosave until the editor advances its accepted base through a successful local Save receipt or explicit resolution of the subscribed document conflict. It then refreshes the private row before saving or clearing it. Merely reading an unchanged generation cannot advance the base.
- Unstructured/transport failures retain the existing explicit retry and uncertain-acknowledgement path. Diagnostic text containing CONFLICT does not trigger reconciliation.
- Simultaneous accepted-document and private-draft conflicts resolve in that order. Private review no longer locks the accepted-document choice; the private buttons remain disabled until the saved revision is resolved. Existing conflict guards still prevent Save/publication.

## Verification

Artifacts: `output/editor-autosave-conflicts-20260928/`.

Controlled hook/editor regressions cover automatic competing-generation review and discard tombstones, stale accepted revision without repeated reads/writes, a delayed accepted-document subscription, explicit keep against the new revision, an in-flight private save rejected during a successful local Save, both conflicts together, lost replies, later typing and retired callbacks. The real CanonicalEditor fixture retains restore/explicit choice/manual Save coverage. The66-test editor suite passes1146 outer assertions (`editor-suite.log`); after final UI wording/disabled-state changes, both affected isolated editor suites pass (`final-editor-tests.log`). Final Admin TypeScript passes (`admin-types-final.log`). These counts include wrapper tests, not every nested assertion.

Actual native proof used two owned Electron processes83345/83535 with separate fresh profiles and the same synthetic operator, against disposable source4860. The native account's private draft is distinct from the separate API fixture account; that API account's generation0 read was not treated as native draft evidence. Exact native rows were read through the existing bounded CLI fixture inspection.

1. First native window authored First private input. Second fresh profile restored that Website draft and autosaved Other window private input (generation2).
2. First window typed Retained native input. The server refused its stale generation and the repaired UI automatically offered review, retaining that exact title with no generic error or Retry button (`native-automatic-review.json/.png`).
3. Second window ordinarily saved its content. First window showed simultaneous conflicts with its accepted-document choice enabled and its private choice disabled (`native-simultaneous-conflicts.json/.png`, visually reviewed). After explicit accepted-revision resolution and private choice, the second window's newer discard tombstone required a further review; no obsolete approval silently overwrote it.
4. Explicitly retaining the first window's input then ordinary Save produced exact accepted revision3 with that title and no generic error (`native-resolved.json/.png`, `final-saved.json`). Read-only inspection proved the private tombstone generation5/baseRevision3 (`native-final-tombstone.json`).

The live two-window flow proves real error transport, automatic review and simultaneous choice usability. The in-flight Save-overlap rejection ordering is controlled regression evidence, not a claim that native timing reproduced that race.

## Cleanup and scope

`cleanup.json`: exact owned page g182k6hneed6ckt80w2yzcr2j98f8p51 removed after document and original-page checks;42 original pages and appearance identity/values preserved. Both owned Electron sessions signed out and closed. API session revoked and private credential file removed. User Electron39198 remained running. No changes to backend draft protocol, production data, tracker status, or unrelated audit campaigns. No push. Continue remaining Task2 family acceptance; F1 plugin defaults remains before Task3, with whole-bundle budget and E22 evidence mapping still open.
