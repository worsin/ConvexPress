# Contact Form and Form Embed customer authority acceptance — September 29

Contact Form and Form Embed now satisfy their tracked block-specific gates. MagicTables readback is **116 Verified / 21 In progress**, 137 rows. Only these two rows' Status, Tests and Screenshots changed; all historical Notes and unrelated cells are exact. The overall delivery goal, Tasks 4–8, E18/E22/E28, Lead Magnet and RSVP remain open.

## Evidence and current customer workflow

Evidence is in `output/forms-customer-20260929/`. This batch uses an actual disposable Clerk development customer on source 4860, confirmed through the authenticated profile query as a subscriber/customer. A disposable membership plan protects a Contact block and the standalone form route. No synthetic customer identity or management session substitutes for the customer browser.

- With access granted, both fields rendered and the real Form Embed UI autosaved “A member note retained across policy changes.”
- Revoking the grant removed the mounted fields. Fresh authenticated Contact and Form reads returned null; stale submission writes returned FORBIDDEN. Resume read was denied and stored draft/answers remained exact (`revocation.json`). Contact has no UI autosave; no Contact draft is claimed.
- A subsequent grant expired naturally at `1790690282042`; mounted fields disappeared at `1790690282346`. A fresh customer JWT check at `1790690315814` denied reads/writes/resume while the stored grant still said active. This proves deadline enforcement independent of the later maintenance status update (`expiry.json`). No backend clock or timestamps were altered.
- Restored access recovered both forms. Actual Contact UI double-click produced exactly one completed entry with the exact message (`contact-complete.json`). The protected resume URL restored the original draft; mobile UI completion kept that same entry, retained its exact answer, displayed confirmation and made the consumed token unavailable (`member-complete.json`, `member-complete-390.png`).
- Actual customer sign-out followed by a settled page reload removed both fields (`signed-out.json`, `guest-denied.png`). The initial pregrant sample was still loading; it is not evidence of a settled denial.
- All final customer browser error collections are empty.

Prior accepted evidence is reused explicitly: [Forms authoring and presentation](forms-acceptance-20260929.md) covers native all-field/resource edits, exact revision 4→6 recovery, actual Website preview, 24 normal/minimum/maximum pack-width cases, real multistep/back-forward answers, unpublication and a true page→outer→inner Contact source graph. That graph updates, withdraws and restores with stable form/field IDs and an unchanged consumer. [Draft authority and resume](forms-authority-20260929.md) covers E58/E59, five red registered-handler cases, 596 backend tests and eight actual four-pack/width restore→same-entry completion→confirmation→consumed-reload cases. The 30-day draft expiry is deterministic registered-handler evidence; this batch's naturally elapsed deadline is membership expiry.

## E60: protected Forms URLs retained anonymous SSR denials

The actual customer could read the authorized form and draft through the backend, but opening the protected resume URL displayed the anonymous SSR 404. The form loaders reused hydrated null via `ensureQueryData`; authentication did not rerun the not-found boundary. After repairing that boundary, the normal protected form URL exposed the corresponding cached membership denial in the parent marketing layout.

The shared Forms recovery hook waits for Clerk and Convex authentication agreement, evicts only the exact form/resume/current route-access reads, and invalidates the current router once per current session/path attempt. A router-local WeakMap shares the pending attempt across StrictMode and boundary remounts. Forms not-found boundaries use this hook; the marketing layout uses it only for gated Forms paths, preserving its existing membership display during recovery. Guests do not retry. The backend remains the authority.

`protected-resume-red.json` and `protected-form-parent-red.json` capture the failures; `protected-resume-green.json` and `protected-form-green.json` capture final real customer recovery. The initial anonymous HTTP response for a protected resume URL remains **404**; authenticated client hydration recovers. Authenticated SSR is not claimed. Missing/archived routes remain real 404s after cleanup. No global routing/auth rewrite or new backend deployment was made in this batch.

Validation: **8 tests / 0 failures across four Website files**, including an actual component/hook fixture checking auth readiness, three exact cache evictions, StrictMode/remount bounds, a changed session, visible network failure and no guest retry. Existing actual resume/wizard lifecycle tests still pass. Website TypeScript and production build pass. Final source was rebuilt and exercised in the customer browser; test/build logs are in the evidence folder.

## Cleanup and acceptance boundary

`cleanup.json` plus the step journal confirm deletion of the owned page and restrictions, archiving both forms and the plan, two revoked grants and one expired grant, inactive customer, deleted Clerk identity, revoked API session, closed browser and removed private credentials/profile. Profile-deactivation event processing completed before restoring muted notification templates.

Original **42 pages, seven forms, plans/rules, appearance/plugins/security/email settings, notification-template values and all 99 email-queue rows** are exact. Public fixture page/form routes return 404. Retained history is explicit: two completed synthetic entries, archived forms/groups/fields and plan, three expired/revoked grants, inactive customer and ordinary event/audit history. No notification delivery or provider acceptance is inferred.

`mt-accept-dry.json` planned two updates and no creates; a fresh preapply comparison matched all 137 records. `mt-accept-verified.json` confirms exact readback, 116/21 and unchanged Notes/unrelated cells. Lead account/environment lifecycle, RSVP legitimate provider and original/generated selection, target Clerk provisioning, model tools and Script Embed Vimeo remain separate gates.
