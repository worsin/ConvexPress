# Remaining canonical blocks: resolver inventory and next slice

Read-only proposal checkpoint, 2026-09-05. Root reports utility74's final22-test gate passed after its nested Section spacing repair; that acceptance is recorded separately from this proposal. No new renderer, model, primitive, registry, schema, provider or runtime activation was changed for this inventory.

## Current count and boundaries

Filesystem discovery contains 74 Library `render.tsx` paths across 136 canonical specs, leaving **62 blocks**. Of those, **45 blocks declare 44 distinct resolver names** (the product resolver is shared by two blocks); **17 declare `data: null`**. The latter are not automatically safe attrs-only work: several have form, provider, viewer, product-selection or reference behavior that still needs an explicit contract.

Only **`content.page`** currently exists in the staged resolver allowlist and private server registry. It supports `core/featured-page` v1. There are **zero registered public canonical-data endpoints**; do not describe the private registry as a deployed query. `site.info`, `commerce.shippingPolicy`, `events.upcoming`, `content.posts` and every other name below currently fail the planner's unsupported-resolver gate. Existing legacy queries are potential adapter inputs, not registrations.

Source evidence: `blocks/.generated/catalog.json` and `dependencies.json`, exact absence of each block's `render.tsx`; `canonical-blocks-foundation/contracts.ts:53` allowlist; `server.ts:56` private registry; `planner.ts` complete preflight; `resolve.ts` binding verification; Website `block-renderer/model.tsx:216` unconditional staged data refusal. All foundation paths below are under `ConvexPress-Admin/packages/backend/`.

## Exact declared-resolver inventory

Requirements below are the current canonical declarations, not inferred readiness. A dash means the spec declares none; it does not waive domain authorization, enabled-plugin checks in existing server helpers, or the missing adapter. The remaining descriptors have30 Library and32 Core provenance records; none is plugin-owned, so no additional provenance-owned plugin was silently added to this table.

| Block | Version | Declared resolver / trusted args | Declared plugins | Declared capabilities | Current adapter |
|---|---:|---|---|---|---|
| `certificates/verify` | 1 | `certificates.verify`; `{}` | certificates | form.submission | Absent |
| `commerce/brand-list` | 1 | `commerce.brands`; `limit=attrs.limit` | — | — | Absent |
| `commerce/bundle-offer` | 1 | `commerce.bundle`; `bundle=attrs.bundle` | — | reference.targetResolution | Absent |
| `commerce/cart-cta` | 1 | `commerce.cartSummary`; `{}` | — | viewer.authorization | Absent |
| `commerce/download-library` | 1 | `downloads.entitlements`; `{}` | digital | viewer.authorization | Absent |
| `commerce/product-compare` | 1 | `commerce.productCompare`; `attributes=attrs.attributes, products=attrs.products` | — | reference.targetResolution | Absent |
| `commerce/product-hero` | 1 | `commerce.product`; `product=attrs.product` | — | reference.targetResolution | Absent |
| `commerce/recently-viewed` | 1 | `commerce.recentlyViewed`; `limit=attrs.limit` | — | viewer.authorization | Absent |
| `commerce/sale-countdown` | 1 | `commerce.productCards`; `limit=attrs.limit` | — | — | Absent |
| `commerce/shipping-promise` | 1 | `commerce.shippingPolicy`; `{}` | — | — | Absent |
| `commerce/variant-picker-teaser` | 1 | `commerce.product`; `product=attrs.product` | — | reference.targetResolution | Absent |
| `commerce/wishlist` | 1 | `wishlists.current`; `{}` | wishlists | viewer.authorization | Absent |
| `core/account-teaser` | 1 | `site.viewer`; `{}` | — | viewer.authorization | Absent |
| `core/anchor-nav` | 1 | `content.anchors`; `source=attrs.source` | — | — | Absent |
| `core/archive-list` | 1 | `content.archive`; `groupBy=attrs.groupBy, limit=attrs.limit` | — | — | Absent |
| `core/breadcrumbs` | 1 | `content.breadcrumbs`; `source=attrs.source` | — | — | Absent |
| `core/child-pages` | 1 | `content.childPages`; `depth=attrs.depth` | — | — | Absent |
| `core/event-rsvp` | 1 | `events.event`; `event=attrs.event` | events | form.submission, reference.targetResolution | Absent |
| `core/featured-page` | 1 | `content.page`; `page=attrs.page` | — | reference.targetResolution | Private staged content.page only |
| `core/form` | 1 | `forms.form`; `form=attrs.form` | forms | form.submission, reference.targetResolution | Absent |
| `core/language-switcher` | 1 | `site.locales`; `{}` | — | locale.routing | Absent |
| `core/menu` | 1 | `site.menu`; `location=attrs.location, menu=attrs.menu, source=attrs.source` | — | reference.targetResolution | Absent |
| `core/poll` | 1 | `forms.poll`; `{}` | forms | form.submission | Absent |
| `core/post-grid` | 1 | `content.posts`; `limit=attrs.limit, query=attrs.query` | — | reference.targetResolution | Absent |
| `core/related-content` | 1 | `content.related`; `limit=attrs.limit, type=attrs.type` | — | — | Absent |
| `core/reviews` | 1 | `commerce.reviews`; `limit=attrs.limit, minRating=attrs.minRating, product=attrs.product, source=attrs.source` | commerce | reference.targetResolution | Absent |
| `core/search-results` | 1 | `content.search`; `kinds=attrs.kinds, pageSize=attrs.pageSize` | — | — | Absent |
| `core/site-info` | 1 | `site.info`; `{}` | — | — | Absent |
| `core/social-feed` | 1 | `social.feed`; `handle=attrs.handle, limit=attrs.limit, provider=attrs.provider` | — | feed.approvedProvider | Absent |
| `core/synced` | 1 | `content.syncedBlock`; `revision=attrs.revision, revisionPolicy=attrs.revisionPolicy, syncedBlock=attrs.syncedBlock` | — | tree.children, reference.targetResolution | Absent |
| `core/table-of-contents` | 1 | `content.headings`; `{}` | — | — | Absent |
| `core/ugc-grid` | 1 | `media.tagged`; `limit=attrs.limit, tag=attrs.tag` | — | reference.targetResolution | Absent |
| `events/calendar` | 1 | `events.list`; `category=attrs.category, limit=attrs.limit` | events | reference.targetResolution | Absent |
| `events/next-event` | 1 | `events.next`; `category=attrs.category` | events | reference.targetResolution | Absent |
| `events/upcoming` | 1 | `events.upcoming`; `limit=attrs.count` | — | — | Absent |
| `gallery/album` | 1 | `gallery.album`; `album=attrs.album` | gallery-recipes | reference.targetResolution | Absent |
| `gallery/recipe-card` | 1 | `recipes.recipe`; `recipe=attrs.recipe` | gallery-recipes | reference.targetResolution | Absent |
| `lms/course-grid` | 1 | `lms.courses`; `limit=attrs.limit, query=attrs.query` | lms | reference.targetResolution | Absent |
| `lms/curriculum` | 1 | `lms.curriculum`; `course=attrs.course` | lms | reference.targetResolution | Absent |
| `lms/instructor` | 1 | `lms.instructor`; `instructor=attrs.instructor` | lms | reference.targetResolution | Absent |
| `lms/progress` | 1 | `lms.progress`; `course=attrs.course, scope=attrs.scope` | lms | viewer.authorization, reference.targetResolution | Absent |
| `membership/gated-teaser` | 1 | `membership.access`; `plan=attrs.requiredPlan` | membership | viewer.authorization, reference.targetResolution | Absent |
| `membership/plans` | 1 | `membership.plans`; `plans=attrs.plans, selection=attrs.selection` | membership | reference.targetResolution | Absent |
| `support/kb-search` | 1 | `support.search`; `category=attrs.category` | support | reference.targetResolution | Absent |
| `support/ticket-cta` | 1 | `support.form`; `{}` | support | form.submission, viewer.authorization | Absent |

Resolver-family counts: content10, commerce10, site4, events4, LMS4, forms2, membership2, support2; certificates/downloads/wishlists/social/media/gallery/recipes each1. These total45 placements and44 unique names.

## Exact no-declared-resolver inventory

| Block | Version | Required next contract or explicit limitation |
|---|---:|---|
| `blocks/contact-stack` | 1 | Phone/email/address can be authored; mapEmbedUrl needs reviewed provider/sandbox behavior. Refuse a populated embed until that contract exists. |
| `blocks/product-collection` | 2 | Modes, product IDs, category/tag slugs and authored product/group collections require explicit source-mode semantics, public product DTOs and catalog resolution. Never silently retain source IDs. |
| `commerce/assistant-band` | 1 | Prompts must reach the actual assistant route/workflow; do not present a simulated answer action. |
| `commerce/category-tiles` | 2 | Category selection and counts require public category data/slug resolution; no placeholder records. |
| `commerce/product-showcase` | 2 | Latest/category/slugs source modes require public commerce card adapter and real cart behavior where requested. |
| `core/booking-cta` | 2 | Plain authored destination is possible; nonempty embedUrl needs approved embed provider and real booking target. No fake booking form. |
| `core/contact-form` | 2 | Actual schema validation, authorized recipient resolution, bounded submission, abuse policy, and confirmed success/error flow are prerequisites despite empty requires. |
| `core/cta-with-form` | 2 | Actual submission/list/form binding is missing; do not invent a successful subscribe action. |
| `core/embed` | 2 | Declared embed.sandbox capability; approved URL/provider mapping, sandbox/CSP and accessible title required. |
| `core/featured-products` | 2 | Product-ID lookup and public catalog DTO required; no invented prices or records. |
| `core/iframe` | 1 | Declared embed.sandbox capability; reviewed URL provider/sandbox/CSP contract required. |
| `core/latest-posts` | 2 | Bounded public post adapter with category/tag resolution, visibility/password/membership checks and exact excerpt/author projection. |
| `core/lead-magnet` | 1 | Declared forms plugin, form.submission and reference.targetResolution; actual list consent/submission plus file delivery/entitlement policy required. |
| `core/map` | 1 | Declared map.approvedProvider; reviewed provider mapping and actual authored coordinates/address, no untrusted embed URL. |
| `core/newsletter-signup` | 2 | Subscription adapter, consent/list destination and actual success/error policy missing; no fake subscribe. |
| `core/script-embed` | 1 | Declared embed.approvedScript; closed provider/resource loader, CSP and lifecycle required. Never inject arbitrary authored script. |
| `core/tag-cloud` | 2 | Bounded public term/count query contract needed even though no resolver is declared. |

## Foundation assessment

Implemented source: the planner validates the whole tree before identity/data reads, accepts only generated canonical versions/attrs and compiled `data.args`, checks server-supplied plugin/capability/disabled policy, rejects unknown instance fields and duplicate IDs, and deduplicates jobs. Limits are512KiB input,80 nodes,depth8,8 unique jobs,60KiB per result and512KiB output. Output reservations count each populated placement, not just deduplicated jobs. The server checks installation website/instance identity, normalizes page IDs, and calls the actual `canDiscoverContent` policy before returning a closed summary; authors, raw bodies, passwords, metadata and customer identity are not DTO fields.

The existing `PageResult` is `{page:null|{id,title,href,excerpt,image:null|{src,alt}}}`. ID/title/excerpt/link/image bounds and exact target association are validated. Unset, malformed, foreign, deleted, non-page, unpublished, password and inaccessible membership targets yield the same null page. `validateCanonicalData` ties entries to exact block IDs/names/versions/resolver/args and environment; extra/missing/mismatched entries refuse. This is structural integrity, not proof of trusted origin or current viewer authorization.

Remaining transport prerequisites are material:

1. Current document/tree and policy must be read by an authorized server entrypoint; do not expose arbitrary caller trees or caller-selected capability flags.
2. Add an actual registered public return validator and portable shared data contracts without importing the root generated folder or Convex server graph into Website. Preserve a single authoritative schema/planner source through the existing deterministic packaging mechanism; do not handwrite a parallel client schema.
3. Bind trusted response/cache lifetime to current installation, current document/revision/tree, current viewer/auth transition and policy change. Never treat the existing website/instance structural envelope as a reusable authorization token. Clear stale data immediately on scope/viewer/tree mismatch and wait for fresh authorized data.
4. Establish aggregate source/read accounting before a public boundedness claim. The current ledger charges complete fetched posts (512KiB each) and media (128KiB each),2MiB cumulative, after each document has materialized. It excludes installation identity, settings, users, roles, plans, storage and policy query reads. Shared membership policy helpers have per-read bounds; that does not establish a whole-page bound. Current-document reads need to be included too.
5. The renderer's layout/style/page-wide anchor validation remains mandatory. A data planner is not a replacement tree validator. Preserve plugin/reference refusal except for the exact validated data binding consumed by an installed adapter; other dependencies still require their own approved resolver.

## Recommended next bounded slice: one real featured-page adapter and view

Implement **`core/featured-page` v1 only** as the first consumer slice. It is the only pending view with an existing registered-in-source policy-aware adapter, precise result schema and real-handler policy coverage. Forcing eight blocks now would hide seven unimplemented adapter contracts.

- Reuse the exact closed PageResult above and normalized `attrs.page` binding. Add a typed renderer data channel for the installed `content.page` adapter, not `unknown` payload spreading or a generic bypass of `descriptor.data`.
- Add an explicit host-only demo adapter capability/discriminant (for example `demo.canonicalData.contentPage`) that is constructed in the isolated BlockDemo adapter module. Stored attrs/JSON cannot grant it. Fixture IDs/data are declared synthetic, and fixture code never imports a live client or public production route. Model integration requires root's ownership handoff; no model edits are part of this proposal.
- Feed fixture envelopes through the same planner and strict binding validation. Do not remove `data` from the spec, add a fake resource to the attrs, or cast the block into the existing static renderer path.
- The view uses a real page title/excerpt, optional resolved public image and configured CTA label. A denied/missing page yields a truthful unavailable/empty state without exposing the reason or previous viewer's content. Missing image uses full-width copy; authored excerpt is not truncated to force a layout. The CTA uses the verified DTO href.
- Add fixture cases for populated image, absent image, long title/excerpt, null target, unsafe result URL, wrong returned ID, wrong scope, changed page args, stale tree/viewer handoff, missing capability, disabled policy and oversized output. Validate all refusals before the view executes. Two same-target placements should share one adapter read while keeping distinct DOM IDs and result bindings.
- Run real foundation policy regressions, portable schema/compiler checks, component/DOM tests and all four packs at1440/390. Review positive/empty/long-copy states, not just screenshots. This would add at most one source renderer; it would not activate public data rendering or close production acceptance.

## Subsequent public read slices, after the featured-page contract is proven

**Site identity**: `core/site-info` needs a new `site.info` args `{}` registration and closed projection `{name,tagline,logo:null|{src,alt}}`, with schema bounds and safe URLs. Source values can come from the existing public-safe settings policy (`convex/settings/queries.ts:getPublic`), but that broad multi-section query is not a bounded adapter by itself. Read only the authoritative public name/tagline/logo fields through a narrow helper, never adminEmail, integrations or credentials. Respect `attrs.show`; absent logo stays absent. It is not currently ready merely because a legacy settings query exists.

**Upcoming events**: `events/upcoming` needs a new adapter with a closed list envelope using the actual public EventView fields, a bounded count and stable time anchor owned by the trusted request context. Existing `extensions/events/queries.ts:upcoming` already enforces enabled Events and public projection, but its legacy `returns:v.any()` pagination envelope is not the new canonical return validator. Retain stable index bounds for reactive pagination, truthful empty/continuable states, safe event/registration links and timezone formatting. Its canonical `requires.plugins` is empty even though the handler requires enabled Events: register/enforce that dependency explicitly rather than dropping the existing plugin policy.

**Document navigation**: headings/anchors/breadcrumbs/child-pages require trusted current-document tree/path context. None currently has a registry entry. Manual-source variants still retain their declared resolver contract until a deliberate versioned schema decision changes it; do not bypass it from the view.

**Shipping policy** is deferred: authored `items` do not justify ignoring `commerce.shippingPolicy`. Policy DTOs need verified source fields and cannot invent delivery windows, prices, returns or guarantees. Viewer-dependent carts, entitlements, wishlists, progress, membership and support/form submissions remain separate authorization/write-adapter work, not fake read-only specimens.

## Acceptance boundary

This is a source-backed proposal and inventory, not new implementation or a test result. Root owns utility74 browser completion, model/primitive changes, cloud transport and public activation. Follow `block-visual-acceptance-standard.md`; renderer presence, functional tests, premium visual review, live data wiring and complete136-block acceptance remain separate.
