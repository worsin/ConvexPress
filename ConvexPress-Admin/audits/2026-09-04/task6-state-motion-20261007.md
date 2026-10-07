# Task 6 presentation, state and motion reconciliation — October 7

The remaining general presentation review is now a specific evidence map: all 137 tracked identities belong to 45 families with 66 named acceptance reports. The map preserves each report's scope and each row's current status. It does not turn missing provider results into successful interactions. There are still four In progress block rows: Assistant Band, Social Feed, Event RSVP and Script Embed.

## Reuse boundary

`output/task6-final-20261007/block-evidence-crosswalk.json` records every identity, current source hashes, report hashes/commits, existing acceptance status and remaining requirement. The table below makes the mapping reviewable without searching old session history. This reconciles existing evidence; the report count itself is not proof.

The family reports establish actual desktop/phone and narrow-container behavior, normal/empty/maximum copy, available/unavailable media, and applicable keyboard/actions. Static text, spacing and structural blocks do not acquire invented submission or playback requirements. Later acceptance supersedes explicit earlier gaps: card-controls closes Feature Grid icons/links and Bento sizes; E107 closes named collection styles; current lifecycle/provider reports qualify older matrices. Actual Instagram success, real Assistant answers/cart tools, human Turnstile registration and Vimeo playback remain required and unproved. Therefore the plan's combined all-interactive-controls checkbox stays open for those four paths.

The final selected desktop matrix remains 548 identities / 699 reviewed segments. The six E103–E105 layout changes are covered by their 27 + 12 + 24 responsive cases and inspected replacement images. E107 adds normal/maximum/empty/focus checks for the new Journal/Depot choices, with exact 390px replacements and declared sampling limits. These are the only visual implementation changes since the final matrix baseline; the later receiver transport and page-route policy repairs do not change public block layout or interaction logic. The current source diff was inspected, rather than treating every historical test as automatically current. Full mobile starter patterns and the four authored example homepages retain their separate accepted records.

## Motion requirement

The Task 6 motion implementation requirement is accepted on the following combined evidence, separately from the unresolved provider actions:

- Section and card entrances use the existing viewport observer and CSS opacity/transform. Pending, missing-observer and reduced-motion content stays readable; focus settles entrances and cleanup disconnects observers/listeners. The original Section report is supplemented by the later callback-ref/null handling in motion-review-20260921.md.
- Both Marquees use CSS transform tracks, start paused, expose playback controls and stop under reduced motion. Repeated rich-Marquee content is inert and hidden from accessibility. The actual current Journal mobile control moved from paused to running to paused; document width stayed contained. This spot check does not replace the earlier four-pack preference/focus and hardware evidence.
- Carousel uses a five-second user-controlled slide interval, not a per-frame animation loop. Earlier four-pack actual timed advance, focus/hover/hidden/reduced-motion stopping and empty/single states remain valid. The current Journal spot check verifies start, keyboard previous/next stopping, polite paused status and visible 2px focus at 390px. A single timed observation returned to slide one and is deliberately not claimed as fresh timed-advance proof.
- Video Hero uses the browser media element with visible/reduced-motion/manual playback lifecycle, error/poster fallback and stale-promise fencing. Steps uses observer-driven discrete selection with CSS opacity; narrow/short/reduced/no-observer cases retain ordinary source-ordered text and images. Their accepted implementations are unchanged.
- Other local entrances and loading indicators use opacity/transform CSS, with scoped reduced-motion rules. The Website global reduced-motion rule bounds generic template spinner/pulse/entry utilities to one 0.01ms iteration and disables smooth scrolling. Template timers are debounce/status/expiry work; navigation RAF coalesces scroll observations and the remaining RAF calls restore focus. No self-scheduling per-frame React animation loop was found in the inspected block/template implementation. Current owned treatments introduce no raster gradient animation; inspected block/pattern screenshots retain their existing CSS/token surfaces.

`motion-provenance.json` compares 24 implementation/report pairs: 20 byte-identical, four explicit deltas. Reveal adds a null guard/callback-ref documentation; base primitives change Grid/Split wrappers and RTL tabs, not Section/Marquee motion; shared CSS changes layout/wrapping/ink, not its motion section; Download Library changes only help-link flex shrink and is byte-identical to its later customer-commerce acceptance. Those four diffs are retained alongside the receipt. This is stronger than the earlier 17-file inventory alone, which missed transition-based Steps and video playback.

The accepted hardware limits remain literal: Marquee's 32 cases/3,840 frames and Steps' 16 cases/7,680 frames are scoped Apple M5/ANGLE Metal observations. Steps' historical 304.5ms event remains unexplained and startup maximum 28.3ms is retained. This report does not claim new hardware timing or universal device performance.

## Current checks and cleanup

Current Section reveal and primitive DOM/hydration wrappers pass (2 outer tests), exercising the existing isolated assertions. Initial invocation from repository root scanned deployment outputs and failed with EMFILE; exact relative paths from Website apps/web pass. No product test or runtime limit was relaxed. The first mobile Carousel screenshot captured the catalog after resizing and is excluded from visual proof; carousel-mobile-visible.png and marquee-mobile.png show the actual controls and were inspected. Initial uppercase accessible-label lookup did not match the DOM; observed selector IDs resolved the correct controls.

Only one temporary BlockDemo tab was used, then closed; the responsive viewport override was reset. No site records, provider settings, backend deployment or protected runtime were changed. The existing BlockDemo served the current worktree. No tracker row promotion and no push.

## Block evidence map

| Family | Blocks | Evidence |
| --- | --- | --- |
| Text and spacing | `core/heading`, `core/paragraph`, `core/spacer`, `core/divider` | [core-family-20260921.md](core-family-20260921.md) |
| Editorial text | `core/list`, `core/quote`, `core/pullquote`, `core/code`, `core/callout`, `core/definition-list` | [content-family-20260921.md](content-family-20260921.md) |
| Tables | `core/table`, `core/footnotes`, `core/comparison-table`, `core/pricing-table` | [table-family-20260921.md](table-family-20260921.md) |
| Structural containers | `core/section`, `core/columns`, `core/group`, `core/grid`, `core/split`, `core/sticky-aside` | [structural-layout-20260921.md](structural-layout-20260921.md), [structural-native-20260921.md](structural-native-20260921.md), [desktop-matrix-final-20261006.md](desktop-matrix-final-20261006.md) |
| Disclosures | `core/accordion`, `core/tabs`, `core/faq`, `core/feature-tabs` | [disclosure-family-20260921.md](disclosure-family-20260921.md) |
| Tabbed content | `blocks/tabbed-content` | [tabbed-actions-20260921.md](tabbed-actions-20260921.md) |
| Media layouts | `core/image`, `core/gallery`, `core/logo-cloud`, `core/media-text` | [media-family-20260921.md](media-family-20260921.md), [layout-wrapper-final-20261006.md](layout-wrapper-final-20261006.md) |
| Media controls | `core/video`, `core/audio`, `core/before-after`, `core/lightbox-grid` | [media-interactive-20260921.md](media-interactive-20260921.md) |
| External media and destinations | `core/embed`, `core/map`, `core/booking-cta`, `blocks/contact-stack`, `core/iframe`, `core/script-embed` | [external-embeds-20260929.md](external-embeds-20260929.md) |
| Hero text and layouts | `core/hero`, `core/hero-split`, `core/hero-text-only` | [hero-family-20260921.md](hero-family-20260921.md) |
| Video hero | `core/hero-video` | [hero-video-20260921.md](hero-video-20260921.md) |
| Calls to action | `blocks/page-banner`, `core/cta-band`, `core/cta-with-form`, `blocks/story-timeline`, `blocks/media-mentions`, `blocks/promo-band` | [cta-family-20260921.md](cta-family-20260921.md), [cta-authoring-20260921.md](cta-authoring-20260921.md) |
| Feature and pricing cards | `core/feature-grid`, `core/feature-list-alternating`, `core/bento-grid`, `core/pricing-cards` | [card-family-20260921.md](card-family-20260921.md), [card-controls-20260921.md](card-controls-20260921.md), [collection-styles-20261006.md](collection-styles-20261006.md) |
| Social proof | `core/stats-band`, `core/testimonials`, `core/testimonial-wall`, `core/team-grid` | [social-family-20260921.md](social-family-20260921.md), [collection-styles-20261006.md](collection-styles-20261006.md) |
| Trust badges | `core/trust-badges` | [trust-badges-20260921.md](trust-badges-20260921.md) |
| Process and dates | `core/process-steps`, `core/roadmap-timeline`, `core/countdown` | [process-family-20260921.md](process-family-20260921.md) |
| Steps with media | `core/steps-with-media` | [process-family-20260921.md](process-family-20260921.md), [steps-review-20260929.md](steps-review-20260929.md) |
| Moving collections | `core/carousel`, `core/marquee`, `blocks/customer-showcase` | [moving-media-20260929.md](moving-media-20260929.md), [motion-review-20260921.md](motion-review-20260921.md) |
| Social utilities | `blocks/social-share`, `core/social-links`, `local/sample-alert` | [social-utilities-20260929.md](social-utilities-20260929.md) |
| Social and UGC feeds | `core/social-feed`, `core/ugc-grid` | [social-ugc-20261006.md](social-ugc-20261006.md), [motion-review-20260921.md](motion-review-20260921.md) |
| Product collections | `commerce/product-showcase`, `blocks/product-collection` | [product-family-20260921.md](product-family-20260921.md) |
| Category tiles | `commerce/category-tiles` | [category-family-20260921.md](category-family-20260921.md) |
| Catalog and policies | `core/featured-products`, `commerce/product-compare`, `commerce/bundle-offer`, `commerce/sale-countdown`, `commerce/brand-list`, `commerce/product-hero`, `commerce/variant-picker-teaser`, `commerce/shipping-promise` | [catalog-acceptance-20260929.md](catalog-acceptance-20260929.md) |
| Customer commerce | `core/reviews`, `commerce/assistant-band`, `commerce/cart-cta`, `commerce/wishlist`, `commerce/download-library` | [customer-commerce-20260929.md](customer-commerce-20260929.md), [assistant-family-20260921.md](assistant-family-20260921.md), [cart-family-20260921.md](cart-family-20260921.md) |
| Recently viewed | `commerce/recently-viewed` | [customer-commerce-20260929.md](customer-commerce-20260929.md), [recent-auth-final-20261006.md](recent-auth-final-20261006.md) |
| Content discovery | `core/latest-posts`, `core/post-grid`, `core/tag-cloud`, `core/related-content`, `core/archive-list`, `core/featured-page` | [content-discovery-completion-20260928.md](content-discovery-completion-20260928.md) |
| Author profile | `core/author-bio` | [author-bio-completion-20260928.md](author-bio-completion-20260928.md) |
| Search controls | `commerce/search-band`, `core/search-box` | [search-discovery-completion-20260928.md](search-discovery-completion-20260928.md) |
| Search results | `core/search-results` | [search-reindex-completion-20260928.md](search-reindex-completion-20260928.md), [search-host-prose-20260928.md](search-host-prose-20260928.md), [motion-review-20260921.md](motion-review-20260921.md) |
| Navigation | `core/table-of-contents`, `core/anchor-nav`, `core/site-info` | [navigation-completion-20260928.md](navigation-completion-20260928.md) |
| Opening navigation | `core/announcement-bar`, `core/breadcrumbs` | [opening-navigation-20260928.md](opening-navigation-20260928.md) |
| Menus and hierarchy | `core/menu`, `core/child-pages` | [menu-directory-completion-20260928.md](menu-directory-completion-20260928.md) |
| Languages | `core/language-switcher` | [locale-destinations-20260928.md](locale-destinations-20260928.md), [locale-promotion-20260929.md](locale-promotion-20260929.md) |
| Forms and submissions | `core/contact-form`, `core/newsletter-signup`, `core/form`, `core/lead-magnet`, `core/poll`, `core/event-rsvp` | [forms-acceptance-20260929.md](forms-acceptance-20260929.md), [forms-customer-20260929.md](forms-customer-20260929.md), [lead-customer-20260929.md](lead-customer-20260929.md), [poll-policy-20260929.md](poll-policy-20260929.md), [rsvp-provider-20260929.md](rsvp-provider-20260929.md) |
| Learning | `lms/course-grid`, `lms/curriculum`, `lms/instructor`, `lms/progress` | [lms-customer-20261006.md](lms-customer-20261006.md), [instructor-final-20261006.md](instructor-final-20261006.md), [layout-wrapper-final-20261006.md](layout-wrapper-final-20261006.md) |
| Events | `events/calendar`, `events/upcoming`, `events/next-event` | [events-display-20261006.md](events-display-20261006.md), [events-final-20261006.md](events-final-20261006.md), [field-events-final-20261006.md](field-events-final-20261006.md) |
| Membership | `membership/plans`, `membership/gated-teaser`, `core/account-teaser` | [membership-final-20261006.md](membership-final-20261006.md), [layout-wrapper-final-20261006.md](layout-wrapper-final-20261006.md) |
| Recipes and albums | `gallery/recipe-card`, `gallery/album` | [plugin-content-20260929.md](plugin-content-20260929.md) |
| Support | `support/kb-search`, `support/ticket-cta` | [support-content-20260929.md](support-content-20260929.md) |
| Certificates | `certificates/verify` | [certificate-final-20261006.md](certificate-final-20261006.md) |
| Text HTML and downloads | `core/rich-text`, `core/custom-html`, `core/file-download` | [text-download-20260929.md](text-download-20260929.md) |
| Grade gallery | `blocks/grade-gallery` | [grade-gallery-20260929.md](grade-gallery-20260929.md) |
| Synced content | `core/synced` | [synced-nested-20261006.md](synced-nested-20261006.md), [synced-legacy-20261006.md](synced-legacy-20261006.md), [synced-promotion-final-20261006.md](synced-promotion-final-20261006.md) |
| Business information | `business/opening-hours`, `business/locations`, `business/service-list`, `business/menu` | [business-content-20260929.md](business-content-20260929.md), [desktop-matrix-final-20261006.md](desktop-matrix-final-20261006.md) |
| Reference and promoted blocks | `reference/field-guide`, `blocks/studio-services` | [field-studio-final-20261006.md](field-studio-final-20261006.md), [field-guide-legacy-final-20261006.md](field-guide-legacy-final-20261006.md), [field-events-final-20261006.md](field-events-final-20261006.md) |
