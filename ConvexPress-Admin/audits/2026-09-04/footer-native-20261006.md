# Native footer row lifecycle — October 6, 2026

E93's native acceptance follow-up on39b4803b. No production changes were required in this batch. E09 and the full delivery goal remain open.

## Actual native workflow

An isolated Electron Acceptance.app window used the existing control-plane4720/4721 and selected the disposable staging environment4860/4861. The actual built Website ran on4322 with its original six runtime configuration fields preserved.

- Core: Add empty row; choose Muted background, Compact padding, Narrow container and Bold border; enter a text heading/body; Save draft. An independent authorized snapshot remained identical to the published baseline. Reload the actual Electron renderer, restore its protected session, Load saved draft, and verify all four controls plus authored content. Review changes and Publish settings. The saved-draft banner disappeared and Everything published appeared.
- Aster House, Journal and Depot: activate each pack through native Templates, then create a row in native Customize. Set Accent background, Spacious padding, Full container and Accent border; enter the text cell. Review and publish each. API readback proves only the expected active-pack/footer changes. Each footer matches the builder defaults plus the exact native-authored row; prior packs' settings remain unchanged.
- Depot: apply Minimal preset, verify its two cells, Undo to the authored text row, Redo to the preset, Undo again to Everything published. No preset change was published.
- Actual Website: each of four published pack rows checked at1440/390, eight cases. Authored text, selected pack,2px border, expected responsive spacing and bounded geometry observed; no horizontal overflow. Core narrow row measures768px desktop; the other packs use the available full width. Browser errors empty. These are live published pages, not the controlled SSR harness used in the earlier E93 batch.

Screenshots: output/footer-native-20261006/native-published.png and each pack at1440/390. Core native publication screenshot and Aster mobile published page visually inspected. Readbacks: native-receipts.json and browser-receipts.json in the same directory.

## Evidence limitations and tooling observations

Saved drafts are keyed by user/pack. A diagnostic query using the separate API admin returned null for the native operator's draft; its subsequent Object.keys call failed. Source confirms the user boundary. Acceptance comes from reloading and recovering that draft as the same native operator, not from the other user's query. No authentication boundary was changed.

Native select popups required keyboard selection with a fresh state read between controls. A browser screenshot helper incorrectly tried to Tab from a nonfocusable heading; that attempt failed and was removed. Geometry and captures were then collected directly. Neither tooling issue is counted as a product defect. The existing Settings Updated toast still exposes literal {settingsGroup}; that previously recorded wording issue is not repaired here.

Core covers saved-draft recovery. All4packs cover native row creation, presentation controls and reviewed publication. Depot covers Minimal preset history. This does not claim all presets, all cell types, pointer reordering, legal-link choices, section background images or every footer field accepted. The E93 remaining-footer map governs the next work.

## Preservation

Before restoration, the current appearance snapshot matched the last owned publication exactly. Original appearance values restored with expected-revision protection. All43pages, general/reading settings, menu locations and the API actor's four drafts compare exactly with their baseline. No page/menu/media fixtures were created. Normal appearance audit/revision metadata and settings notifications may advance.

Native scope restored to Live; control-plane sign-out observed. API session revoked; refresh401. Owned Electron61555 and Website61556 stopped; private native profile/session removed. Tab31 closed and viewport reset; all seven protected processes remain alive. No live environment publication, backend deployment or push.

## Claude audit49

ACCEPT its no-new-findings/no-drift assessment as advisory context, consistent with the inspected39b4803b source and current evidence. The audit predates this native follow-up. No scope change, no waiting; Codex retains decisions.

Next: prove and repair remaining exposed global footer section/cell settings, beginning with Column Layout, Background/Image, Top Border and Padding. Reuse E81–E93 and this native lifecycle evidence. Full goal remains active117Verified/20In progress.
