# Aster native Customizer and bounded repairs — October 5, 2026

Aster House's native activation, saved draft, reload/load, reviewed live publication and matching public Website were exercised on the disposable target4870. This is bounded acceptance of the controls below, not all Customizer fields, a complete authored website, staging promotion, shop behavior (disabled on this target), or all22dashboard surfaces.

## Runtime acceptance

Owned Electron22909 with private profile `electron-customizer-aster-20261005`, existing current Admin4105 and separate Website4321 production output from `output/customizer-runtime-20261005/dist`. Target identity was asserted before mutation; baseline28pages/onepost, complete appearance, general settings, menus/locations, email templates/queue and API-user drafts were captured privately. There were no active settings-notification templates and no native Aster saved draft before this run.

Native activation changed Core to Aster. Dusk & ember palette, Lora display/Inter body selections, comfortable type scale, rounded radius, narrow content width, spacious section spacing, compact content spacing and medium block gap reached preview CSS. Header CTA label/destination/enabled state rendered in the actual iframe. Minimal footer rows with `Aster field notes © {year}` rendered2026. Layout and footer reset/Undo preserved unrelated changes. Saved draft did not change the published snapshot. Reload/load restored rendered CTA/footer. Review exposed45changedsettings; live publication remained disabled before explicit confirmation. Publication succeeded and the saved draft cleared asynchronously.

A separate unauthenticated headed Website at1440 and390px rendered Aster, #ed9472 primary, Lora heading, `/login` CTA and the footer text. Width/scroll were1440/1429 and390/379. Zero page errors. Native/public desktop/phone screenshots inspected. This target has no published posts; the empty content shell is not a finished example site.

Original appearance values restored with expected-revision guard; revision/audit metadata advances. All28pages, post list, general, menus, locations, queue, templates and API-user drafts exactly match baseline. No content/menu/media fixture was created. API session revoked. See final session/process cleanup receipts for native lifecycle.

## E70: named native header/footer controls

Actual Header CTA toggle had no accessible name; visible text labels were not associated with input controls (`getByLabel` failed although placeholder-based text naming existed). The shared HeaderComposer/FooterComposer used a bare label and generated input IDs, and supplied switch identity only to its hidden input. Repair assigns stable per-instance field IDs and matching labels to text/select controls and names section/field switch roots. Existing callbacks, settings shape and persistence are unchanged.

A mounted actual-component regression failed with expected CTA Button name / received null, then passed across header and footer including linked field labels.3tests/17assertions pass. Actual native refreshed page resolves Button Label through its label, clicking the label focuses its input, and the CTA switch exposes its name. Admin TypeScript and focused lint pass.

## E71 / Claude audit32 D1: breadcrumb serialization

Adapt/accept the unsafe-serialization finding. Breadcrumbs used raw JSON.stringify inside a script element while other SEO components already use serializeJsonLd. Actual SSR component tests with the real breadcrumb hook produced an extra image element from a decoded route parameter and authored labels/links. Reusing the existing safe serializer prevents script termination, while JSON parsing round-trips all original values. Both failing-before cases now pass; the isolated wrapper and adjacent article-security suite pass6outertests/55assertions. Website TypeScript and focused lint pass.

The attempted complete `/certificates/<encoded payload>` replay against the preceding production build hit ERR_TOO_MANY_REDIRECTS. No claim of verified public URL script execution or refreshed production deployment is made. The repair is grounded in reproduced unsafe component HTML, and the report preserves the distinction from the auditor's proposed exploit route. Audit32 currently ends mid-D1 at4630bytes; unread later findings are not inferred.

Artifacts: ignored `output/customizer-aster-20261005/`: native-session, activated/published snapshots, draft-rendered, unpublished-proof, native-published-proof, published-proof, before/after control labels, red/green logs, type/lint logs, screenshots and cleanup-proof. No secrets in this report, no push.
