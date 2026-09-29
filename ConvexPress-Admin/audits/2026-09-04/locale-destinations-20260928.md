# Locale destination consistency — September 28

Shared public document destinations now cover localization, navigation, related/featured content, menus, search and membership route checks. Search's validated path/encoded slug behavior is centralized. Legacy menus intentionally retain explicit `/` and already-served `/page/` paths, and normalize missing leading slashes. Membership retains legacy aliases and adds corrected destinations, preserving restrictions.

Claude F19 is accepted within this boundary. Ordinary page create/update slugifies to ASCII-safe values; the encoding discrepancy was reproduced with a registered historical fixture, not ordinary new authoring. A historical spaced/accented slug made Breadcrumbs reject the unsafe URL while locales produced the encoded destination. Both now agree. Malformed legacy paths preserve access restrictions on raw, old served and corrected routes. No URL rewrite or content migration was performed.

## Evidence and preservation

- 19 focused tests /85 assertions and 497 backend tests /3,792 assertions pass. Backend types, strict deployed typecheck, writer preflight, generated contracts and kit freshness pass. Website/Admin source and build were unchanged; their prior build evidence is reused.
- Eight public cases across Core, Journal, Depot and Aster House at1440/390 verify configured English/Spanish/Arabic destinations, current-language state, RTL label, keyboard navigation to the actual Spanish page and reverse English link. No overflow or page/console errors.
- Owned native Electron31538 opened the existing English page read-only and selected Language Switcher. The actual Website iframe displayed all three correct destinations and current state. Screenshot inspected, no errors; no new authoring/recovery claim from this read-only check.
- Source4860 snapshot `ConvexPress-Admin/output/production-checkpoints/locale-destinations-20260928`:1,621 hashes without drift,22 installed Events files retained,2,410 function signatures unchanged. Codegen's two pure-helper declaration lines reviewed. No target4870 mutation.
- All42 source pages, locale configuration, selected translation groups and appearance values exactly preserved. No content created. API session revoked. Native signed out, exited and its owned profile removed. User processes39198/62672/65092/68390 and owned Website29505 preserved.

Evidence: `output/locale-destinations-20260928/`, especially `backend.log`, `public-matrix.json`, `native-proof.json`, `installed-source-proof.json`, `cleanup.json` and `lifecycle.json`.

## E41: missing localization promotion

A read-only export of the three retained source language pages succeeds with the Language Switcher payload but emits zero locale records and no issues. Source settings enable en/es/ar and a group contains two translation identities. The export omits this required host context. This is an actual source export against a synthetic matching target descriptor; no target import was attempted. Probe corrections (schemaVersion and required route-policy selection) are harness setup, not product defects.

Repair boundary: an explicit localization selection in normal promotion review, portable routing and complete selected translation groups, remapped page identities, bounded dependency closure, current capability checks, conflict detection and recovery. Preserve unrelated target groups and separate databases. Verify registered adverse cases and real source-to-target configured links before accepting Language Switcher. A refusal alone does not deliver the feature.

Language Switcher remains In progress. Tracker stays75 Verified /62 In progress; no tracker write in this batch. Full goal remains active. No push.
