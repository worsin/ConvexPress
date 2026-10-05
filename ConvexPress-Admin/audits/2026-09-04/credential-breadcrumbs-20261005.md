# Credential route breadcrumbs — 2026-10-05

Claude audit32 O1 accepted. Current tracking, shared wishlist and shared-cart routes fall back to their token parameter for a breadcrumb label. The hook now uses explicit generic labels for those three route identities before either parameter or loader-slug fallbacks. Home navigation remains; no credential URL is generated for the current crumb. Ordinary authored overrides and noncredential routes are unchanged.

The actual Breadcrumbs component and hook are server-rendered with each route identity, a synthetic bearer parameter and a loader slug containing the same value. All three failed before the change. Afterward, current-page labels are Track order/Shared wishlist/Shared cart; generated HTML and JSON-LD contain no token; Home is the sole link and JSON-LD retains the generic label without a token destination. Existing markup-injection/normal authored-label cases also pass. Website TypeScript and scoped lint pass. This is component/route-input evidence, not a claim of separate live commerce workflows or a Website deployment.

No backend data, sessions or processes changed. Full delivery remains open. Evidence red log: `output/credential-breadcrumbs-20261005/red.log`.
