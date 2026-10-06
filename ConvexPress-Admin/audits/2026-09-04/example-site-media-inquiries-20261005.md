# Original media and working inquiry forms

Task6/E10 continued from db1ba684. Four original generated images and two working inquiry flows were added to the dedicated staging examples; no original source/target site writes or backend deployments occurred.

## Authored media

The built-in image_gen tool created four landscape 1536×1024 PNG assets for Fieldwork Studio, Slow Current, Common Supply and Aster House. Outputs were inspected and copied without modification to `examples/sites/assets/`. Their exact prompts, provenance, hashes and alt text are tracked there.

All four were uploaded through `media.generateUploadUrl` + storage POST + `media.create`. Normal scheduled sharp processing reached active status with four sizes each. No direct database patch or processing-state override. Six hero media references and one Journal inline image were saved through canonical expected-revision transactions across seven documents, preserving published status. Readback matched each complete normalized tree. The first comparison correctly refused a recipe lacking materialized schema defaults before any document write; comparison was corrected to use the existing canonical normalization function. No partial mutation was replayed.

Actual Website browser evidence: Core studio image present; Journal, Depot and Aster home images loaded with their expected alt text and natural width 1536. The image references are media-library records, editable through the canonical fields. This does not close full responsive crop/layout acceptance or individual product photography.

## Inquiry flows

Core `/page/our-studio/` and Aster `/page/plan-a-visit/` now embed published Forms records with name, email and message fields. Forms and their required Custom Fields dependency are enabled only on those examples. The normal form/field APIs created the records; each has a default confirmation customized for the demonstration. All seeded notification rows are disabled before publication; submissions stay local and do not send mail or make bookings.

Actual browser acceptance:

- Core empty submission displayed all three required-field messages and focused the name field.
- Filled Core with Casey Example / studio-check@example.invalid / an explicit demonstration message; visible confirmation reported a saved inquiry and no email/project booking.
- Filled Aster with Rowan Example / stay-check@example.invalid / an explicit demonstration message; visible confirmation reported a saved inquiry and no reservation/email.
- Authorized Admin entry queries found exactly one complete submission per form with all three expected stored answers. Notification rows remained disabled. The two synthetic submissions are retained for operator review.

Live IDs and operation receipts are in `output/example-sites-media-20261005/`. Inquiry definitions are tracked in `examples/sites/resources/inquiries.json`. Aster's prior future-tense inquiry paragraph was updated in both its recipe and published page to describe the actual local workflow. The old draft-authoring journal is historical; do not rerun it against these edited/published documents.

Every script-owned site session was logged out in finally and its refresh token subsequently returned401. Tokens existed only in process memory. User sessions, original sites and running Admin/Electron/BlockDemo processes were preserved. No external notification was sent. No push.

## Still open

Individual Depot product images/categories/variants and test checkout/order flow; author/masthead finishing; full responsive/keyboard and visual polish; actual native editor edit/reopen/Website-preview round trips for these examples; the remaining editor/SDK/Customizer/BlockDemo requirements. The 137-block tracker stays117 Verified /20 In progress. No finished-site or overall completion claim.

Next bounded step: complete Depot's actual product presentation and commerce behavior, then native/preview and responsive acceptance. Core mobile drawer's user-menu setting discrepancy remains separately recorded; diagnose its real contract before repair. Latest Claude audit remains39; no new deep-audit file was available at this checkpoint.

Verification follow-up: the five recipe/schema/link/discovery tests pass with83 assertions from `scripts/sites` (the initial root-cwd invocation did not resolve the test module; it was rerun from the documented directory). Aster copy save's first readback timed out in the backend isolate. Authoritative subsequent read confirmed revision6 and exact requested blocks; the pending receipt was reconciled without replaying the mutation. Container remained running, OOM=false, restart count0. The timeout remains a runtime observation, not a claim that all latency paths are accepted. Core studio image load additionally confirmed naturalWidth1536.
