# E86 — header search variants and placeholders

Task 5, 2026-10-06. Search consumer repair and native publication accepted. Full template delivery remains open (117 Verified / 20 In progress).

## Failed workflow and repair boundary

1. Required workflow: an operator chooses Inline Bar, Icon Only or Expandable and an authored placeholder in native Customize; the actual Website uses those settings.
2. Evidence: real-header regression fixture failed 11 of 12 pack/variant cases. Core/Journal/Aster always showed an icon and ignored the overlay placeholder; Depot always showed its inline form.
3. Dependency: Website header consumers and search surface data omitted the declared variant/placeholder contract. Backend storage and native controls already contained those values.
4. Repair: shared header field/trigger behavior, inline placement within the desktop row and a full-width phone row, a revealed in-flow field for Expandable, and each pack's existing search surface for Icon. Optional placeholder surface data preserves existing callers. Pack typography, tokens and editorial/retail field treatments remain distinct. Trigger focus returns on dismissal.
5. Exit check: all 12 real pack/variant cases pass with authored placeholders, empty-query refusal, trimmed site/catalog routing, opening focus, Escape, submit dismissal and disabled search. Native publication and actual Website desktop/phone checks described below pass.

Ruling: Inline is always available; Icon opens the existing pack search surface; Expandable reveals a field in the header flow. This makes the exposed choices distinct without replacing pack overlays or redesigning search results.

## Verification

- `output/header-search-20261006/red-compact.log`: 11 reproduced case failures before production changes.
- `tests.log`: 8 focused tests pass, 0 fail (search's 12 case groups; navigation, branding, layout and directional sticky-header regression coverage).
- `types.log`, `build.log`: Website type check and production build pass.
- Changed-file oxlint: zero warnings/errors. Full repository health is not inferred from these checks.
- `browser-proof.json`: 24 accepted actual Website checks: four packs × three variants × 1440/335 widths. Exactly one visible search input when expected; configured placeholder; open focus; Escape closes; no observed horizontal header overflow. Inline input widths ranged from 238px on Journal desktop to 786px on Depot desktop; the narrowest mobile icon field was Depot at 164px.
- `submissions.json`: actual trimmed `archive` submissions from each pack reach `/products?q=archive` on this commerce-enabled source. The non-commerce `/search` branch is covered by the real component tests; the source plugin settings were not changed.
- `aster-expandable.png`: visually inspected actual Website result; `native-search.png`: native controls/preview capture.

All three variants were published through the actual native Customizer for each pack. Core/Journal were checked first. During the first Depot attempt the next Customizer action still targeted Journal. Those six browser results were rejected after the rendered header and snapshot contradicted the label. Corrected Journal's placeholder, confirmed Depot activation before editing, added an explicit rendered `data-template` check, and repeated Depot. Raw receipts retain the rejected pass; accepted files keep the final distinct pack/variant/width results only. Do not count the rejected pass as Depot evidence.

This batch tests the search fields' publication path. E84's accepted shared draft/reload/Load saved draft/history lifecycle remains reusable; it was not independently repeated for each search variant. Arbitrary long-menu combinations and mobile menu variants are outside this exit check.

## Preservation and cleanup

`native-published-snapshot.json` exactly matches the baseline plus the four intended search groups and active Core. `restoration.json` verifies original appearance values restored and pages, general settings, reading settings, menu locations and all four draft records unchanged. No menu/content/media fixtures or backend deployment were needed. Normal revision/audit metadata advanced through authorized publication/restoration.

`cleanup.json`: original native Live scope restored, native sign-out observed, scoped API session revoked and refresh rejected with 401, owned PIDs 52199/52344 stopped, private profile removed, seven protected processes alive. Owned browser tab closed and viewport reset. No push.

## Next

E87: mobile Drawer/Fullscreen/Dropdown and side semantics. Keep remaining Task 5 menu-source/location combinations and the full delivery acceptance explicit. Claude audit 47 supplies no new defects; accept its bounded progress assessment as advisory context, not completion evidence.
