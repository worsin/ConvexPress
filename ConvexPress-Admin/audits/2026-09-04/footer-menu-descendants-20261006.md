# Footer menu descendants — October 6, 2026

Task5 consumer defect E81 is repaired. Actual footer surfaces discarded every child of a resolved top-level menu item. Links nested under a heading, separator or ordinary link disappeared in all four packs, in row cells, section columns and inline footer lists. Header/mobile descendant acceptance did not cover these consumers.

## Repair boundary

The shared `footerMenuItems` projection exposes all non-orphaned resolved descendants in depth-first authored order. Footer navigation remains a flat, always-reachable list without dropdowns. Orphaned ancestors suppress their whole branch, matching header behavior. The menu tree, assignment, public resolver, persisted data and header disclosure model are unchanged. Shared `MenuItemTarget` retains heading/separator semantics and link destinations/target/rel. Core/FooterRows, Journal, Depot and Aster consume the same projection, exactly once per list.

## Evidence

- New actual-component regression failed in all12pack/layout combinations before implementation: only Last-link rendered instead of Getting-started, Deep-link, Below-divider and Last-link. It now passes all12, asserting order, exact target/rel, nonlink heading, suppressed separator label, orphaned branch omission and unchanged authored input. Existing copyright, Core footer and full menu-render suites also pass:4outer tests; their isolated suites retain their own assertions.
- Website TypeScript, changed-file oxlint and production build pass. Build log: `output/footer-menu-descendants-20261006/build.log`.
- Actual component SSR output with controlled resolved menu data and current production CSS was served locally on4333. CUA verified24browser cases:4packs×3layouts×390/1440. Four links have nonzero geometry in every case; Tab from Getting-started focuses Deep-link; no document horizontal overflow. Receipts/captures: `output/footer-menu-descendants-20261006/rendered.json` and pack/layout/width PNGs.
- Visually inspected Core inline390, Journal rows390, Depot columns1440 and Aster inline390, plus Core rows390. A missing UTF-8 declaration in the temporary evidence wrapper caused copyright mojibake; the wrapper was corrected and Journal screenshot replaced/re-inspected. This was not an application encoding change. Bun emitted a directory-mismatch diagnostic after successful fixture export; the12assertions completed, and browser rendering was independently checked.

These are controlled consumer/keyboard/layout checks. They do not claim fresh native menu creation, assignment, save/reopen/publication or end-to-end backend resolution. Prior native assignment/publication evidence remains separately recorded in customizer-chrome-20260929.md; full Task5 remains open. No database, credentials, API sessions or customer settings were changed. The owned browser tab closed and viewport override reset; local evidence server stopped. Existing authored example tabs retained. No push.

Next: reconcile remaining Task5 promotion/conflict receipts and exercise outstanding pack-owned settings at their declared scope. Claude audit45 remains latest observed and already adjudicated; no wait or scope change.
