# Canonical signup integration — September 6

Newsletter signup and CTA with inline form had accepted renderers and a tested production mutation adapter, but canonical public bodies did not mount that adapter and the backend authoring policy did not enable form.submission. This work connects that boundary. Other unfinished form blocks remain disabled.

## Implementation

PublicCanonicalBody mounts ProductionNewsletterProvider only for an installed, validated public document. The provider uses the current Convex client and website/instance/viewer generation. Existing transport identity and document remount behavior discard stale pending state. Native preview does not mount a production provider. Backend canonical policy now includes the supported submission capability; absent renderers/resolvers remain unavailable.

Live acceptance exposed a pre-hydration native GET submission: enabled SSR controls could send the entered email in the URL before React handled submit. The initial attempt created no subscriber. The final provider renders disabled controls with Preparing signup until its effect confirms mount. Native preview retains its explicit disconnected state. Actual SSR and production-provider DOM regression verify this boundary; the corrected live flow keeps the URL unchanged.

## Evidence

- Registered canonical lifecycle test saves both blocks, publishes and reads anonymously; unsupported form/contact/poll blocks stay disabled; display creates no subscriber. Backend file:41tests/307assertions pass.
- Renderer wrapper including actual production-provider DOM, existing pending/rejection/scope tests and real-handler fixture passes. Website and scoped backend TypeScript pass. An initial unscoped backend tsc inherited the parent project and hit4GiB heap; the correct project and CLI typecheck passed.
- Four packs × home/page/post actual-workerd HTML contain both forms with disabled inputs/buttons and the Preparing signup message. No external network used by that hosting gate.
- Native editor authored both signup blocks on Navigation field guide; saved revisions17→19, original7blocks retained exactly, total9. Saved Website preview acknowledges and renders both with inputs/buttons disabled. Final native editor reports All changes saved.
- Staging backend checkpoint newsletter-host-20260906:1110files, dry-run and deploy with typechecking passed; identity/storage healthy and media epoch preserved. Website release artifact prefix bcd3b734747e published through Electron.
- Actual published forms each submitted a different example.invalid address, displayed validated success and focused status. Reload and repeated signup returned success without duplication. Authoritative staging rows1→3, only2new synthetic subscribers, repeat total3. Email table empty before/after.
- Mobile idle/success and desktop Aster screenshots inspected; no horizontal overflow.
- MagicTables Notes for core/newsletter-signup and core/cta-with-form updated after exact two-row dry-run and complete readback; unrelated fields preserved.

Root evidence: output/newsletter-host-20260906, output/playwright/newsletter-host-20260906. Synthetic subscriber records and the authored demonstration blocks are retained as staging fixtures. Production was not modified. Renderer acceptance remains95/136; complete-block flags remain false pending the remaining lifecycle and production matrix. core/form and contact-form are still unfinished.
