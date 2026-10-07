# Selected-resource AI authoring — October 7

Status: selected-resource canonical generation, custom composition review, AI template styling and SDK export acceptance pass. This is not whole-delivery acceptance. Evidence lives in `output/ai-resources-20261007/`.

## Canonical page acceptance

In the actual native Electron Admin on original Alpha, the configured provider generated a page from the selected Northstar Compact 15 Espresso Machine and hero espresso-bar media. The review proposal contained a canonical image, live product hero and nested section/heading/paragraph (five nodes, three roots). Before Apply, authenticated readback remained the empty draft at revision 1. Explicit review/apply produced revision 2; reload retained it; publication review produced revision 3 with exactly the same tree. The actual registered Website preview and desktop/mobile public page showed the selected image and current $299 sale/$349 regular price, with no overflow or page errors. The owned page is `vh7zzxw82cs7v0bc1bpkcek3xx8ftqhv`; it was recoverably trashed after acceptance.

Receipts: `page-verified.json`, `draft-before-apply.json`, `draft-applied.json`, `draft-published.json`, `public.json`, `proposal-review.png`, `proposal-website-preview.png`, `public-desktop.png`, `public-mobile.png`. The earlier `selected-resources.png` was captured while media verification was pending; it is not final selection evidence.

## E116: rejected composition and bounded correction

Three native custom-block generation attempts failed before any definition was saved. The provider succeeded but authoritative validation rejected its output. A separate diagnostic capture through the actual configured provider and source handler produced a media field without `storage: id` and unsupported comparison expressions. This diagnostic was read-only and is not native acceptance; earlier uncaptured proposals are not assumed to have identical errors.

Source `7cb1c7f0` adds one corrective provider request carrying bounded validator feedback and the previous untrusted proposal. Every result must pass current scope, permissions, resource availability and the original generation fingerprint. Two invalid results stop without saving; oversized results are not replayed. Existing review, save and publication guards are unchanged. The new internal checker keeps authority failures outside its recoverable validation branch.

Registered tests demonstrate invalid-first/valid-second generation, exhausted retries, authority revocation during correction, feedback for simultaneous media/grammar errors, and oversized output. The focused suite passes 60 tests and 769 assertions. Strict backend TypeScript passes after explicitly matching the existing certificate action return validator in its handler annotation; this annotation has no runtime behavior change.

Receipts: `correction-red-backend.log`, `correction-suite.log`, `backend-types-fixed.log`, `diagnostic-provider-result.json`, `diagnostic-validation.json`. The root-directory EMFILE run and wrong-cwd pre-edit repeat are harness failures, not product evidence.

## Follow-up: schema completeness

The first installed correction candidate still rejected two native requests after two provider attempts each. Nothing was saved. Read-only diagnostic capture showed that the original plain-language request omitted media storage, while a more explicit request omitted a loop alias; the correction repaired the latter. These diagnostic outputs are distinct from uncaptured native proposals.

Source `040c4305` makes looping containers a separate tool-schema branch requiring `each`, `as` and nonempty `children`; nonloop branches do not advertise either loop property. Generation instructions explicitly explain media ID versus media-object storage, paired loop keys and boolean-only conditions. The plain-language request then validated on the first actual diagnostic provider response. No validators were weakened, no retry budget increased, and no user prompt needs to carry these implementation rules.

The updated focused checks pass 60 tests / 807 assertions (49 definition/transport tests and 11 canonical AI tests), plus strict backend types. The frozen installed/native check is pending. Receipts: `diagnostic-guidance-accepted.json`, `schema-guidance-tests.log`, `schema-guidance-canonical-tests.log`, `schema-guidance-types.log`; final deployment receipts in `output/ai-compose-guidance-20261007/`.

## Native composition, authored-binding repair and style acceptance

Source `040c4305` returned a native review proposal from the original plain-language request. Authenticated readback confirmed zero definitions while the proposal was open. Review removed unsupported performance claims before saving version 1 as an unapproved draft. The actual Website preview then reproduced `Unavailable expression path: attrs.anchor`: resolver-backed definitions deferred all example execution, including authored fields that need no resolver data.

Source `6e23d609` executes authored-field bindings for every example/treatment while deferring only data-dependent nodes. It keeps media placeholders confined to contract validation and separately verifies selected-resource authority. A registered fail-before/pass-after case covers both proposal checking and creation. Final focused suite: **61 tests, 812 assertions**, strict backend types passed. The frozen final candidate contains 2,033 captured Admin files; the original Alpha installation has 1,787 modules. Actual installed read-only replay rejects the original native output with its exact missing-binding issue and accepts the reviewed binding fix. No provider call or database write was used for that replay.

Native review removed the undeclared anchor binding in version 2. The registered Website preview then rendered the selected image, live Coffee Scale title, $45 price and real product link. Actual configured AI produced three distinct treatments: Depot (version 3), Aster House (version 4) and Journal (version 5). All fields, defaults, examples, resolver bindings, base composition and earlier treatments were preserved exactly. Journal matched the original active template and was previewed in the actual Website. Review reduced its oversized display heading to `lg` in version 6. These review edits are disclosed; the AI output is not claimed to be publication-ready without review.

Receipts: `compose-native-proposal.json`, `definition-guidance-unsaved.json`, `compose-reviewed-source.json`, `definition-saved-draft.json`, `compose-preview-error.json`, `authored-bindings-red.log`, `authored-bindings-green.log`, `authored-bindings-types.log`, `installed-binding-check.json`, `compose-preview-proof.json`, `style-preservation.json`, the three `style-*-proposal.json` files, `journal-reviewed-preview.png`. Final installation receipts: `output/ai-compose-bindings-20261007/`.

## Portable export and reuse by page-generation AI

Export correctly rejected site-owned resource defaults. Native review prepared version 7 with empty media/product selections and a boolean image toggle, preserving the earlier selected-resource versions. The actual Electron download matches the normal authenticated export exactly (apart from the documented download newline). Disposable SDK dry run, write, generation, repeated generation check and generated contract test pass; its source was archived and the disposable tree removed. The shipped 137-block inventory did not change. Native installation inspection correctly reported `not-installed`; this particular acceptance block was not installed into original Alpha as a Library block. Full installed canonical promotion/confirmation/revocation evidence remains the already accepted `promotion-installed-20261006.md` workflow, not a claim about this fixture.

A second actual native page-generation request used approved custom version 7 with the selected scale/image plus a nested core section/heading/paragraph. The saved published revision 3 remained exactly unchanged throughout review. Reviewer edits removed unsupported copy. Apply saved once as revision 4, and a full native reload retained four nodes with exact resource IDs and `showImage: true`. The actual Website proposal preview and public desktop/mobile page rendered the selected image, live $45 price and product link; both public viewport checks returned HTTP 200 with no overflow or page errors. Core/plugin generation, composed-library generation and enabled-catalog/disabled/hidden/cross-site registered tests jointly cover the actual AI authoring gate; this is not a claim that every block was independently generated by AI.

Receipts: `export-failure.json`, `portable-review-source.json`, `native-download.json`, `ai-sdk-export.png`, `export-receipt.json`, `cli-proof.json`, `sdk-source-evidence.zip`, `custom-library-ai-review.png`, `draft-before-custom-ai.json`, `draft-custom-review-unsaved.json`, `custom-library-ai-preview.json`, `draft-custom-applied.json`, `custom-public.json` and the desktop/mobile screenshots. The initial Playwright download-event timeout was an Electron harness mismatch; the Electron session download event completed successfully.

## Cleanup and limits

The owned page was recoverably trashed with its tree intact. Approvals for owned versions 5, 6 and 7 were revoked; immutable definition/history records remain. Original 17 users, 9 posts, 11 revisions, 50 storage records, 14 settings, 15 queued emails, 12 assistant sessions, 8 messages, 1 shopper memory, 7 carts and 2 cart lines match the baseline exactly. All 14 protected processes remain alive. Native cleanup restores the prior controller selection, signs out and closes only the owned process/profile; see `native-cleanup.json` for completion.

Current original Alpha source is `6e23d609`. Other fleet final candidate/source parity remains Task 8. This batch does not close Instagram, real human Turnstile verification, public HTTPS editing or whole-delivery acceptance. Audit 66 remains advisory and already adjudicated; no work waits for another audit.
