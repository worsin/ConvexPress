/** Public route patterns from the Website route tree. Kept in sync by its contract test.
 * Shared pure policy: Admin warnings and server writes use the exact same matcher.
 * Static routes outrank pretty-page aliases; dynamic segments match one segment.
 */
export const PUBLIC_ROUTE_PATTERNS: readonly string[] = [
  "/account/courses",
  "/account/courses/$slug",
  "/account/courses/$slug/$nodeId",
  "/api/auth/callback",
  "/api/author/$slug/feed/",
  "/api/author/$slug/feed/atom",
  "/api/blog/$slug/feed/",
  "/api/blog/$slug/feed/atom",
  "/api/category/$slug/feed/",
  "/api/category/$slug/feed/atom",
  "/api/comments/feed/",
  "/api/comments/feed/atom",
  "/api/downloads/$leaseId",
  "/api/feed/",
  "/api/feed/atom",
  "/api/feed/rss2",
  "/api/lead-magnets/$leaseId",
  "/api/robots",
  "/api/sitemap-$type-$page/xml",
  "/api/sitemap-style/xsl",
  "/api/sitemap/xml",
  "/api/tag/$slug/feed/",
  "/api/tag/$slug/feed/atom",
  "/archive",
  "/archives/$id",
  "/author/$slug",
  "/blog/",
  "/blog/$slug",
  "/blog/$year/$month/$day/$slug",
  "/blog/$year/$month/$slug",
  "/brands/$slug",
  "/bundles",
  "/bundles/",
  "/bundles/$slug",
  "/cart",
  "/cart/",
  "/cart/shared/$shareToken",
  "/categories",
  "/categories/",
  "/categories/$slug",
  "/category/$slug",
  "/certificates",
  "/certificates/$serial",
  "/certificates/verify",
  "/checkout",
  "/checkout/",
  "/checkout/confirmation/$orderId",
  "/checkout/payment",
  "/checkout/review",
  "/checkout/shipping",
  "/courses",
  "/courses/",
  "/courses/$slug",
  "/courses/$slug/$nodeId",
  "/dashboard",
  "/dashboard/",
  "/dashboard/addresses",
  "/dashboard/comments",
  "/dashboard/courses",
  "/dashboard/courses/$slug/$nodeId",
  "/dashboard/downloads",
  "/dashboard/events",
  "/dashboard/help",
  "/dashboard/membership",
  "/dashboard/notifications",
  "/dashboard/orders",
  "/dashboard/orders/$orderId",
  "/dashboard/orders/$orderId/return",
  "/dashboard/posts",
  "/dashboard/profile",
  "/dashboard/returns",
  "/dashboard/returns/$returnId",
  "/dashboard/reviews",
  "/dashboard/security",
  "/dashboard/settings",
  "/dashboard/subscriptions",
  "/dashboard/subscriptions/$subscriptionId",
  "/dashboard/tickets",
  "/dashboard/tickets/$",
  "/dashboard/wishlist",
  "/document-preview",
  "/events/",
  "/events/$slug",
  "/forgot-password",
  "/forms/$slug",
  "/forms/$slug/resume/$token",
  "/gallery",
  "/gallery/",
  "/gallery/$slug",
  "/gallery/category/$slug",
  "/help",
  "/help/",
  "/help/$categorySlug",
  "/help/$categorySlug/",
  "/help/$categorySlug/$articleSlug",
  "/help/collections/$slug",
  "/help/search",
  "/login",
  "/logout",
  "/page/$",
  "/pricing",
  "/products",
  "/products/",
  "/products/$slug",
  "/recipes",
  "/recipes/",
  "/recipes/$slug",
  "/recipes/category/$slug",
  "/register",
  "/reset-password",
  "/search",
  "/signup/$offerId",
  "/support",
  "/support/",
  "/support/new",
  "/support/tickets/",
  "/support/tickets/$ticketId",
  "/tag/$slug",
  "/track/$token",
  "/verify-email",
  "/wishlist/$token"
] as const;
export function normalizePageRoute(path: string): string {
  return '/' + path.split(/[?#]/)[0].split('/').filter(Boolean).join('/');
}
export function reservedPageRoute(path: string, dashboardBase?: unknown): string | null {
  const normalized = normalizePageRoute(path);
  const dashboard = normalizePageRoute(typeof dashboardBase === 'string' ? dashboardBase.trim() : '/dashboard');
  if (dashboard !== '/' && (normalized === dashboard || normalized.startsWith(dashboard + '/'))) return dashboard;
  const segments = normalized.split('/').filter(Boolean);
  for (const pattern of PUBLIC_ROUTE_PATTERNS) {
    const expected = pattern.split('/').filter(Boolean);
    let matches = true;
    for (let index = 0; index < expected.length; index++) {
      const segment = expected[index];
      if (segment === '$') break;
      if (!segments[index]) { matches = false; break; }
      const expression = segment.split(/\$[a-zA-Z][a-zA-Z0-9]*/).map((part: string) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+');
      if (!(new RegExp(`^${expression}$`)).test(segments[index])) { matches = false; break; }
    }
    if (matches && (expected[expected.length - 1] === '$' || expected.length === segments.length)) return pattern;
  }
  return null;
}
export function pageRouteWarning(path: string, dashboardBase?: unknown): string | null {
  const match = reservedPageRoute(path, dashboardBase);
  return match ? `${normalizePageRoute(path)} belongs to a built-in website route (${match}). Choose a different page slug or parent. Existing pages remain editable at their /page address.` : null;
}
