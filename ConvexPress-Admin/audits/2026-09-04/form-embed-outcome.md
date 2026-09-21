# Canonical Form embed — September 6, 2026

`core/form` now uses a closed, selected-ID-bound `forms.form` resolver, the existing public Forms wizard, and a document-authorized native picker. It is the 96th of 136 blocks with renderer/browser acceptance. This is a scoped milestone, not full Forms extension or app production acceptance.

## Implementation

The backend checks the active Forms plugin, published form status and membership route policy before reading fields. Only public settings and security configuration cross the canonical boundary; notification/action references and administrative metadata are excluded. Field reads use the shared request ledger and refuse oversize definitions rather than dropping required fields. Anonymous direct form reads/submissions now also honor the route policy. The picker pages through published forms in the selected website after reauthorizing the edited document. Form schedules trigger bounded public refreshes.

Preview rendering reuses shared field/step helpers without mounting submission, autosave, payment or CAPTCHA effects. The public host mounts the existing FormWizard after hydration; SSR fields remain disabled and have no native GET form. Repeated placements have unique field IDs, and embedded forms avoid duplicate h1 headings. Explicit control styles make the SDK/BlockDemo controls inherit all four packs without relying on Tailwind being loaded.

## Acceptance evidence

- Canonical backend: 48 tests /352 assertions; Forms regression: 692 tests /1744 assertions. Backend, Admin and Website TypeScript passed. Canonical renderer/DOM wrapper and form/event refresh tests passed. Generated contracts and whitespace checks passed.
- All four packs passed actual-workerd homepage/page/post rendering, including disabled SSR form fields and pending-host notice. Real BlockDemo browser checks passed at 1440px and 390px with no page errors or overflow; both steps and keyboard focus verified. Screenshots visually inspected. An initial browser-default control styling defect was corrected before acceptance.
- Native Electron selected **Plan a slower day** through **Choose a published form**, saved Navigation field guide revision 19→20, and preserved the original nine blocks exactly. The page now has ten blocks.
- Staging backend checkpoint `form-embed-20260906` deployed healthy with the current media epoch preserved. Native Cloudflare publishing produced Website artifact prefix `db7cf4080b9f` at `aster-house-staging.h5s.workers.dev`.
- The fresh saved preview acknowledged delivery and displayed three disabled fields with no form element. Earlier inspection after lease expiry correctly showed the authorization prompt; the fresh-lease check passed.
- A real public submission using `form-embed-20260906@example.test` produced one new completed database entry, the configured confirmation and focus on its status container. URL unchanged. Submission count 1→2; emails remain 0. All six pre-existing notification rules are disabled and there are no actions.
- Proof: `output/form-embed-20260906/runtime-receipt.json`, adjacent native/public logs and before/after snapshots, `output/playwright/form-embed-20260906`, and `output/block-demo/form-embed-polished-20260906`.

MagicTables `core/form` Notes were updated and read back exactly; all other cells, including full-lifecycle gates, were preserved.

## Follow-up

The count-limited submission scan blocker below was resolved in `form-counts-outcome.md`, including live final-slot concurrency acceptance. The original milestone evidence is retained.

## Still open at the initial milestone

This live form covers text, email and textarea; synthetic preview covers select and multiple steps. Advanced field types and embedded payment/CAPTCHA/autosave/resume need separate acceptance. The canonical reader refuses large count-limited forms when the exact submission count would exhaust its read budget; replace that scan with a maintained bounded count before claiming scale readiness. Full block lifecycle flags stay open. Forty block renderers and the broader original audit, handoff, fleet, customer-isolation, commerce, Customizer and release gates remain in the master ledger. No commits or pushes; production database and original checkout untouched.
