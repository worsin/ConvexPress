# Resolved menu headings and separators — September 29

E28's shared rendering cause is repaired locally. Live responsive acceptance remains open; this is not completion of the full Customizer/menu task.

## Cause and repair

The public menu resolver already preserves `heading` and `separator` item kinds and removes their URL. `useMenuForLocation` carries the kind into `ResolvedMenuItem`, while its compatibility URL defaults to `#`. Header, mobile and footer consumers previously ignored the kind and rendered every item as a link. The failing-before regression rendered three links for a heading, separator and one actual link.

`MenuItemTarget` now owns this common rendering decision. Actual links keep their destination, target, relationship, active styling and navigation callback. Static headings render text. A heading that controls a desktop submenu renders a button with its current expanded state and the existing keyboard behavior; pointer activation works too. Dividers have horizontal or vertical separator semantics and do not expose their editor label as navigation text. Retained children below a separator stay reachable as an open group instead of being hidden behind an unfocusable divider.

The boundary is wired into Core's shared desktop, dropdown, mobile, footer and menu-location consumers; Journal and Aster House's own header/mobile/footer implementations; and Depot's departments, mobile groups and footer locations. Depot no longer invents an `All <heading>` link for a group heading. Explicit authored footer link cells remain link cells because they do not use the resolved-menu type. Adjacent automatic footer bars do not duplicate an authored separator.

## Verification

`tests/menus/render.test.ts` executes an isolated test process with **31 targeted checks**. It renders the actual four pack header components, mounts the actual four pack mobile components, checks the shared desktop/dropdown/list/footer consumers, and exercises heading submenu Enter, Space, Escape, ArrowDown and pointer activation. It verifies real-link counts/destinations, retained heading text, suppressed separator labels, separators, descendant reachability and expanded-state semantics. The second failing-before regression caught missing `aria-expanded` on nested heading buttons, which is now supplied.

The tests provide controlled menu data and stub unrelated account/cart/settings/router state. Real navigation components and Depot's Dialog implementation execute. These are DOM/SSR semantics checks, not browser geometry, live menu assignment or authenticated Customizer acceptance.

Website TypeScript, scoped lint and diff hygiene pass. The central block renderer suite was refreshed after the final source/test changes:317tests/5,493assertions and1,148example/pack executions across137blocks. No block tracker gate was promoted. No database, menu assignment, template selection, authored content or external provider setting was changed by this repair.

Evidence: `output/menu-semantics-20260929/tests.log`, `types.log`; `output/block-evidence-20260929/renderer-tests.json` and `renderer-tests.log`. The existing Website4322 and pending RSVP browser were not rebuilt/restarted during this source repair.

## Remaining acceptance

Verify the changed source in an isolated current Website runtime at desktop and mobile widths for all four packs, including open nested menus, keyboard focus/escape, Depot's department popup and footer layouts, while proving existing menu assignments remain exact. Broader native Customizer assignment/save/reopen/publish/conflict/authority work remains Task5. E28 stays open until that evidence is recorded.
