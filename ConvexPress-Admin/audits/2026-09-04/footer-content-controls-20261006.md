# Footer content controls — October 6, 2026

E95 repairs a Task 5 dependency. Overall delivery remains active; this does not close E09 or change the 117 Verified / 20 In progress block inventory.

## Required workflow and cause

Authors choose Branding, Legal Links and navigation sources in Customize, then optionally convert sections to rows. The choices must reach the Website and survive conversion.

A new actual-component regression fixture produced 38 failure groups: legal choices ignored across all four packs; Auto Pages read the assigned Footer menu; Journal/Aster kept their section mastheads when branding was disabled; both conversion helpers replaced Auto Pages/Custom with Footer 1 and converted Custom legal links into Privacy.

## Repair

- Shared legal links render Privacy + Terms, Privacy Only, the assigned Footer menu for Custom, or nothing for None. Existing conversion destinations `/privacy` and `/terms` are retained; authors remain responsible for those pages or choose Custom. Nested custom menu items retain target/rel semantics.
- Auto Pages uses the existing public `pages/queries:getTree` with `status: publish`, preserving hierarchy order and full paths. It runs only for the selected Auto Pages component, with the existing request-scoped query cache/SSR path.
- All four section surfaces and their row renderers support Auto Pages. Journal/Aster section branding now honors the toggle; authored-row pack mastheads remain unchanged.
- Native and backend pure conversion helpers preserve Auto Pages and map Custom to Footer. Custom legal links become a Footer menu cell. Native cell selection includes Auto Pages and retains existing unknown locations.

## Verification

63 new cases pass across four packs and both conversion helpers. Existing menu descendant, copyright, Core footer, section controls and row controls suites also pass (six test wrappers total). Both app type checks and production builds and changed-file lint pass. Core's disabled-column assertion now scopes the column navigation, since legal navigation is intentionally present independently.

Actual isolated Electron, disposable staging 4860: disabled Branding, selected Auto Pages, changed Legal Links to Privacy Only, observed actual Website preview, converted sections to rows, opened the menu cell and observed Auto Pages still selected. Snapshot stayed exactly unchanged until Review → Publish. Publication changed only Core footer settings. Reload reopened the published configuration and preview.

Actual published Website at 1440 and 390 pixels matched all 38 anonymous-public page destinations/titles, including nested paths, in order. Privacy remained, Terms and footer branding were absent, no horizontal overflow. Phone screenshot inspected. This is fresh native Core evidence plus component coverage for all packs, not a claim that every remaining footer field is accepted.

## Preservation

Original appearance values restored under exact snapshot/revision guard. All 43 stored pages, general/reading settings, menu locations and the API actor's four draft slots match the baseline. Native Live selection restored and operator signed out. API session revoked; refresh returned 401. Owned native 65331 and Website 65425 stopped, private profile removed, browser tab 33 closed, viewport reset; seven protected processes remain alive. No content/media changes, backend deployment, live publication or push. Normal appearance revision/audit metadata advanced.

Evidence: `output/footer-content-controls-20261006/` contains tests/build/type logs, publication/public-page capture, browser receipts, screenshot, restoration and cleanup receipts. Baselines/session material are kept out of the repository in the protected acceptance directory.

Next: remaining footer cell controls (contact icons, cell alignment, image sizing, newsletter audience semantics), then reconcile Task 5 closure against reusable lifecycle evidence. Do not repeat accepted field matrices or wait for Claude's forthcoming audit.
