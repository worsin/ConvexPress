# September 21 block and template review

This checkpoint fixes two product defects and two browser-harness defects. It does not complete the production goal. The original audit remains five accepted rows (A01/A02/A03/A05/B08), nineteen open; complete block/native/live-data/motion and template handoff acceptance remains open.

## Product changes

**Purchase downloads:** a late lease response could continue after its component unmounted, or after the user switched away and back to the same session. Scope equality also missed runtime-instance changes and revoked authentication. `useDownloadPurchase` now binds each attempt to an active mount and authority generation, checks it after asynchronous boundaries, and prevents an old response from clearing a new account's busy state. Same-scope uncertain initiation retains its request identity for retry. Seven real-hook StrictMode cases cover cancellation, handoff timing, current success, retry and cross-account busy state. Five regressions failed before repair. This prevents late client handoff/click side effects; it does not claim cancellation of an already-minted server lease or a new live delivery-provider acceptance.

**Depot embedded form:** the baseline width cap and a large pack heading squeezed ordinary words into broken fragments in the intro column. The owned Depot treatment now fills the available measure, uses a compact container-relative heading and stacks below a 52rem available-container threshold. Persisted schema and content are unchanged. A DOM Range regression detected split words before repair; it now passes at available widths1296/800/600/320, including input width, overflow and stacked/split geometry. Selected final screenshot inspected.

## Browser harness repairs and actual results

The broad current-source sweep completed with **142 passed, eight skipped and three failed**. The skipped cases require live environments; SDK motion and all-example matrix cases were deliberately outside this sweep. All three failures were investigated, not removed:

- Gallery assumed the last example was the no-image example. Appended showcase examples invalidated that assumption. It now locates each declared no-media specimen by its expected content, retains the zero-image and copy checks, and allows time for the expanded137-block matrix. The corrected rerun passed:137 blocks × four discovered packs × two viewports, **1,096 selected-specimen captures**. This is not a new285-example run or manual review of1,096 images.
- Both Wishlist surface failures resulted from the demo's HTML stylesheet link escaping the Vite demo root. The server returned HTML rather than CSS; images rendered at their intrinsic sizes without Website utilities. Importing the real Website stylesheet through the module graph fixes development and production resolution. New computed-style preconditions prevent another unstyled false result. The existing interaction and overflow assertions are unchanged. Both desktop/mobile cases pass across Core, Journal, Depot and Aster House in development and production.

Wishlist checks exercise shopping-session readiness, the selected-variant add callback, options link, unavailable-product removal, item and list pagination, and visible narrow Depot controls. Additional interactive exploration covered unavailable/loading/ready recovery and keyboard collapse/expand. Representative Core desktop and Depot mobile screenshots were reviewed. This is fixture-backed surface acceptance, not new customer-account/backend acceptance.

The form-focused run passed five cases (including two existing contact-form cases); production demo checks passed the new form-layout case and both Wishlist cases. These overlap the broader suite and must not be added as unrelated acceptance counts. An earlier gallery rerun started before its source correction and failed again; only `matrix-current` is the corrected result. Initial form harness selector mistakes are retained separately from the actual failing-before product regression.

## Validation and source status

Website scripts passed614 web cases, one orders case,16 tooling cases and11 demo cases at this batch's earlier checkpoint. The seven download behaviors also passed in their isolated process; its wrapper is not an eighth independent behavior. Final focused wrapper rerun passed. Website and demo typechecks, client/SSR build and final demo build pass. Block checks and every generated-contract freshness phase pass; all77 distributed kit files are current. Three kit scaffold tests pass. Focused lint and whitespace checks pass. Build chunk-size warnings remain and are not treated as a performance pass.

Updated SDK documentation removes obsolete claims that custom definition storage, AI management and promotion are unimplemented. Static Studio Services promotion has existing native/deployed evidence; data/media/child-slot promotion remains explicitly open.

MagicTables changes are Notes-only for `core/form`, `commerce/download-library` and `commerce/wishlist`, with dry-run and all137 rows compared before/after. Full-block Status/Tests/Screenshots flags remain unchanged. No backend deployment, live document mutation, credential operation or provider action occurred in this batch. The original user app processes are preserved; only the owned preview server/browser are closed after verification.

Evidence is retained under `output/block-acceptance-20260921/`: `browser.log`, `download-before.log`, `download-after.log`, `download-final.log`, `form-regression-before.log`, `form-after.log`, `matrix-current.log`, `matrix-current/`, `wishlist-current.log`, `wishlist-current/`, `production-current.log`, `production-current/`, `website-tests.log`, `website-build-final.log`, `demo-build-current.log`, `lint-final.log`, `kit-tests.log` and `mt-verified-current.json`.

Next: continue full per-block/template visual and native authoring acceptance, then remaining original production gates. Neither this checkpoint nor its screenshot count closes the entire library or release.
