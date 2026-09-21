# Divider and Spacer migration and native treatment controls — September 21

## Delivered behavior

All four legacy Spacer sizes (small/medium/large/xlarge) and all three Divider variants (default/section/subtle) now have exact, closed canonical `original` treatment mappings. Previously conversion refused these valid legacy choices because no matching treatment was declared. Conversion preserves the original authoring revision and explicitly uses full width/no added wrapper spacing. Unknown attributes and choices remain rejected. Existing untreated v2 blocks retain their template-driven behavior; no saved content is rewritten automatically.

All four packs advertise these treatments. Original Spacer heights remain16/32/64/96px with the standard spacing token. Divider widths remain1/2/1px, with16/16/8px vertical margins and the existing semantic border colors. The production renderer accepts finite choices, never arbitrary authored CSS.

The native editor now exposes advertised treatment choices and their finite axes from generated metadata. This also supports the existing Product Collection and Field Guide treatment contracts. Treatment values use the canonical generated validator; template changes preserve unavailable saved choices until explicitly reset. Changes participate in ordinary preview, undo/redo and revision-guarded saves. Pending/conflicted/locked or unauthorized sessions cannot mutate through these controls. This is presentation editing, not a second content schema.

## Verified evidence

- Converter regression failed before the mapping change;5 converter cases/1009 assertions pass. Default legacy choices, every explicit choice, immutable input, unknown values and extra fields are covered.
-91 registered document-service tests/887 assertions pass, including migration, save/readback and exact original utility attrs/version recovery.
-292 renderer cases/5111 assertions pass. The added case covers every choice under all four packs and rejects invalid treatments.
- Four browser cases pass: existing text/layout behavior plus actual original utility renderers beside canonical conversions at1440/390 across Core, Journal, Depot and Aster House. Original CSS is compiled from the real legacy renderers with pinned Tailwind; a tracked generator and receipt are checked by the browser suite. No manually imitated legacy stylesheet is used.
- Treatment-control regression failed before implementation. Seven editor/adapter/composition wrapper tests/743 assertions pass. They cover every declared axis choice, immutable content, invalid/unknown input, unavailable pack choices, real DOM preview/undo/redo/reset/CAS save and locked/removed authority.
- Admin, Website, backend and BlockDemo types pass. Admin and Website production builds pass; existing bundle warnings remain. Canonical and distributed-kit checks, generated freshness, focused lint and whitespace pass.

## Native and public acceptance

The isolated source4860 backend was strictly deployed after a private storage-inclusive backup. Its1593-file checkpoint preserves the generated SDK plugin graph;19 backend files were overlaid. No production cloud/provider/DNS change occurred.

Owned Electron35274 selected Promotion Lab staging. One disposable15-block legacy page contained every utility choice, with headings identifying each. Native review/conversion, anchor edit/save/reopen and actual embedded Website preview passed. Native publication and template activations were followed by eight actual built Website checks (four packs ×1440/390), retaining sizes, border weights, margins, anchor and no horizontal overflow/page errors.

Native treatment editing changed small→xlarge with a96px actual preview, then verified undo/redo and save/reopen. Reset-to-template-default/undo and Divider default→section/save/reopen passed. Returning the choices to their originals preserved the entire expected tree except the deliberate anchor. Withdrawal and original-editor recovery restored all original authored values.

A first native screenshot caught an unsettled preview and did not show the treatment controls; it is not visual signoff. The same owned fixture was temporarily restored for a second native session42370. After conversion, the actual live preview settled and a focused native treatment-controls screenshot was captured and inspected. A second original recovery reached revision11. Core desktop and Journal/Depot/Aster mobile public screenshots were inspected, as was the settled control screenshot. This is scoped visual review, not whole-library aesthetic acceptance.

The recovered page differs from its initial record only in revision/update metadata and its retained publication timestamp. Publication metadata intentionally stays current during authoring recovery. The initial broad all-fields comparison correctly exposed that distinction; authoring fields match exactly. Harness corrections included a wrong Published label, cross-realm array comparison, and waiting for the original editor rather than a conversion button after recovery. None required replaying an uncertain content write.

All42 original pages and complete appearance values match baseline; the fixture is trashed, API sessions logged out and owned profiles removed. First native logout was confirmed. During the second session's closing sequence the Playwright kernel reported an unhandled dialog protocol rejection; the native process is confirmed exited, but its logout acknowledgement is not separately retained. This uncertainty is disclosed rather than recording a second confirmed logout. Owned preview/demo/tunnel processes were stopped; original Electron39198, renderer69634, demo8172 and SOCKS68390 are preserved.

Artifacts: `output/utility-migration-20260921/`.

## Remaining scope

This closes the utility conversion/authoring/recovery gap. It does not close full Library acceptance, shared conditional visibility/active locking, complete cross-template native authoring, installed-fleet migration/retirement or release/provider gates. Those are distinct remaining requirements; tests and screenshots must not be relabeled as full production certification. Original audit remains8accepted/16open. Spacer/Divider MagicTables notes and evidence flags are updated with Status unchanged.
