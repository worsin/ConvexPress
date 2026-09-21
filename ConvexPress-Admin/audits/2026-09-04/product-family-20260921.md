# Product Collection and Product Showcase acceptance — September 21

**Both blocks are accepted for their current canonical contracts. Total: 22/137 verified, 115 pending. The original production audit remains eight accepted and sixteen open.**

## Repairs

- Journal and Depot Product Showcase overrides used viewport breakpoints inside narrow desktop columns. The failing browser regression reproduced crowded Journal cards in a 420px column. The overrides now use the collection container. All four packs pass 420px single-column and 760px two-column checks inside a 1440px desktop page, for both blocks.
- Valid authored prices and badges could overflow their cards. A 234px card measured 969px of content even though the outer canvas reported no overflow. Price text and badge content now wrap within their own cards. Regression checks cover maximum title, summary, price and badge lengths at desktop/mobile widths. The first repair addressed the badge but missed anonymous text in the price flex container; the retained intermediate failures led to the complete repair.
- Carousel navigation remained after selecting an empty group. The regression reproduced this after actually scrolling the rail. Empty/non-carousel rails now clear navigation state, and controls require rendered products. Returning to the populated group restores the rail at its beginning.

No saved schema, block version, resolver, authorization or backend deployment changed. Current legacy conversion/recovery contracts remain intact.

## Native and live acceptance

Owned Electron 18749 used the existing renderer 4105 with a private profile, the disposable Promotion Lab staging site 4860, and page `g187q6edwam3xhbk9g2yyckk0d8evnk7` (`/page/product-family-20260921`). Through the actual editor:

- Inserted Product Collection from the catalog; authored heading and a manual card with title, description, real destination, price, badge, an existing site image and explicit alt text.
- Added a named group using the real product picker, initially selecting the variable shirt and then adding the downloadable product. Enabled purchase controls and chose carousel, two columns and square images. Save/reopen preserved values and treatment.
- Inserted Product Showcase and selected two published products by slug in deliberate order. Save/reopen preserved the source and heading; publication rendered the ordered catalog.
- Public desktop/mobile rendering loaded the actual authored image and alt text without page/card overflow. Keyboard group selection showed the catalog product. Its Choose options link reached the actual product route and matching H1.
- Each block separately added the correct real downloadable product to the cart. Each addition was verified on the real Cart page and removed; both checks ended empty. No checkout/order/payment was initiated.
- Native switching to recentlyViewed produced the actual previously visited shirt on the published page; manual mode was restored afterward.
- Eleven read-only previews against the installed backend verified all seven Collection modes and all four Showcase sources, exact manual/slug order, recent ordering, group projection and empty ineligible selections. Stored document identity/revision/content were unchanged. An initial attempt overlapped the native save and correctly received CONFLICT; the final run used a stable revision and passed.
- Native withdrawal and original-editor recovery restored zero blocks, followed by native logout. The fixture was trashed. Full comparisons preserve all 42 prior pages and appearance values. No catalog/media/provider settings were edited. API session logout and private profile removal passed.

## Rendered behavior and design

BlockDemo now exposes explicit source, availability and synthetic cart-host specimens for these two blocks. They use the existing canonical resolver/result contracts, grant installation and actual product components. The synthetic host never calls commerce APIs or creates orders.

Five focused cases cover four packs at 1440/390, with additional 420/760 content widths: all source selections; manual and grouped cards; absent-source non-fallback behavior; keyboard groups; carousel movement/empty recovery; maximum authored copy; no-host product links; loading/busy disabling; failed add and successful keyboard retry; actual product IDs sent to the host; all five stock states; options links; decoded images; card containment; and reduced-motion transitions. All five pass against the built demo. The final two purchase cases also verify that the new availability controls cannot leak into other product-block specimens; they pass again after that isolation guard and the final demo rebuild. Development also passes the two existing category/product/FAQ cases, for seven cases total. The expanded medium-column case was rerun separately after the original development run.

Current native mobile, Depot desktop Showcase, Journal desktop Collection and Aster mobile Showcase screenshots were visually inspected. They supplement the unchanged prior four-pack example/empty-state reviews and current automated image/geometry checks. Real catalog items without images deliberately retain their placeholders; the native manual card demonstrates actual site media.

Headed Chromium reports Apple M5 ANGLE Metal. Both blocks' actual image hovers were measured for 90 frames per pack, with transform reaching 1.035 and p95 intervals 7.8–8.6ms. First-pass maxima included 34.6ms in Core and 20.9ms in Aster Showcase. Three additional 120-frame samples per affected pack, after fonts/images and layout settled, had maxima 7.7–7.8ms. Both initial and follow-up measurements are retained. This is scoped hardware evidence, not a universal frame-rate or whole-application guarantee. Earlier actual Collection carousel motion evidence remains applicable because its scrolling implementation was unchanged.

## Checks and evidence reuse

- 17 current backend reader tests /103 assertions: all source modes, publication/membership/taxonomy restrictions, stale/missing references, ordering, sale windows, reservations/backorders, variable/external stock, rating disclosures, argument bounds, history and source budgets.
- 297 current renderer cases /5143 assertions, including the existing duplicate-click and keyboard-group DOM checks.
- Website/demo types and builds, focused lint, whitespace, canonical contracts/freshness, block catalog and all 77 kit distribution files pass. Existing chunk-size warnings remain; these builds do not establish whole-app performance.
- Reused unchanged shared authoring validation and native count/category/tag checks from `commerce-authoring-20260921.md`; action validation from `cta-family-20260921.md`; locks, audience, migration/revision recovery and prior block-specific cloud/cart evidence. No full backend redeployment or gratuitous full-suite rerun was needed for renderer/CSS changes.

Artifacts: `output/product-family-20260921/`, including failing-before/intermediate logs, final browser/production logs, live-modes.json, native-public.json, recent-history.json, motion.json, motion-warm.json and cleanup.json. MagicTables changes only these two rows' Status/Tests/Screenshots/Notes, with dry-run and complete 137-row readback comparison.

This acceptance does not close checkout/webhook/refund correctness, provider/domain launches, signed distribution, remaining blocks/templates or the sixteen original production gates. Next: continue the remaining commerce blocks and their actual host integrations, starting with Shopping Assistant Band; retain this pair's valid evidence.
