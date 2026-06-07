import { createFileRoute, Outlet } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { useUser } from "@clerk/clerk-react";
import { api } from "@convexpress-website/backend/generated/api";

import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { BackToTop } from "@/components/layout/BackToTop";
import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { LayoutShellProvider } from "@/components/layout/LayoutShellProvider";
import { MobileNav } from "@/components/layout/MobileNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SkipToContent } from "@/components/layout/SkipToContent";
import { ThemeStyleInjector } from "@/components/layout/ThemeStyleInjector";
import { WebsiteAdminBar } from "@/components/layout/WebsiteAdminBar";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { PageOverridesProvider, usePageOverrides } from "@/contexts/PageOverridesContext";
import { useLayoutConfig } from "@/hooks/layout/useLayoutConfig";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { useHeaderConfig } from "@/hooks/layout/useHeaderConfig";
import { useMenuForLocation } from "@/hooks/layout/useMenuForLocation";
import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import { RestrictedContent } from "@/components/membership/RestrictedContent";
import { checkRouteAccess } from "@/lib/routeRestriction";
import type { RouteAccessResult } from "@/lib/routeRestriction";

export const Route = createFileRoute("/_marketing")({
  loader: async ({ context: { queryClient }, location }) => {
    // SSR route restriction: check if this pathname is membership-gated.
    // Fails softly (returns allowed:true) on any error so existing pages
    // are never accidentally broken by the restriction check.
    const [routeAccess] = await Promise.all([
      checkRouteAccess(queryClient, location.pathname),
      queryClient.ensureQueryData(convexQuery(api.settings.queries.getPublic, {})),
    ]);
    return { routeAccess };
  },
  component: MarketingLayout,
  notFoundComponent: NotFoundPage,
});

function MarketingLayout() {
  const { routeAccess } = Route.useLoaderData();
  return (
    <LayoutShellProvider>
      <PageOverridesProvider>
        <MarketingLayoutInner routeAccess={routeAccess} />
      </PageOverridesProvider>
    </LayoutShellProvider>
  );
}

/**
 * Inner layout component that can access LayoutShellProvider context.
 * Applies aria-hidden and inert to the main page content when
 * mobile nav is open for WCAG 2.1 AA compliance (finding #163).
 *
 * Supports per-page hideHeader/hideFooter overrides via PageOverridesContext.
 * Child routes (blog posts, pages) can set overrides to hide the header
 * or footer for specific content configured in the admin.
 *
 * Wave 7: if the loader's routeAccess indicates the current pathname is
 * membership-gated and the user lacks the required plan, the Outlet is
 * replaced with a RestrictedContent gate instead of rendering the page.
 */
function MarketingLayoutInner({ routeAccess }: { routeAccess: RouteAccessResult }) {
  const siteIdentity = useSiteIdentity();
  const headerConfig = useHeaderConfig();
  const headerMenu = useMenuForLocation(getHeaderMenuLocation(headerConfig.navigation));
  const layoutConfig = useLayoutConfig();
  const { mobileNavOpen } = useLayoutShell();
  const { overrides } = usePageOverrides();
  const { user, isLoaded } = useUser();

  const hideHeader = overrides.hideHeader === true;
  const hideFooter = overrides.hideFooter === true;

  // Determine if this route is currently gated. Re-derive from client-side
  // Clerk state so the gate reflects the actual auth status after hydration
  // (the loader runs pre-auth on SSR, so it sees the unauthenticated decision).
  const isRouteGated =
    isLoaded &&
    !routeAccess.allowed &&
    routeAccess.reason !== "no_restriction" &&
    routeAccess.reason !== "plugin_disabled" &&
    routeAccess.reason !== "check_failed";

  // If the user signed in after SSR (client hydration), re-check access.
  // The query is cached by the queryClient, and the user's grants determine
  // whether the route is truly restricted for them.
  const userState = !user ? "logged_out" : "logged_in_non_member";

  const pageContent = isRouteGated ? (
    <RestrictedContent
      mode={routeAccess.teaserMode ?? "hide"}
      rule={{
        teaserMode: routeAccess.teaserMode,
        customMessage: routeAccess.customMessage,
        matchingPlanIds: routeAccess.matchingPlanIds as any,
      }}
      userState={userState}
    />
  ) : (
    <Outlet />
  );

  return (
    <>
      <AnalyticsProvider />
      <ThemeStyleInjector />
      {/* MobileNav is outside the inert wrapper so focus trap works */}
      {!hideHeader && (
        <MobileNav
          menu={headerMenu}
          siteIdentity={siteIdentity}
          config={headerConfig.mobileMenu}
        />
      )}
      <div
        aria-hidden={mobileNavOpen || undefined}
        {...(mobileNavOpen ? { inert: true } : {})}
      >
        <SkipToContent />
        <WebsiteAdminBar />
        {!hideHeader && (
          <SiteHeader
            siteIdentity={siteIdentity}
            menu={headerMenu}
            layoutConfig={layoutConfig}
          />
        )}
        <div className="flex flex-1 flex-col">
          <ContentWrapper layoutConfig={layoutConfig}>
            {pageContent}
          </ContentWrapper>
        </div>
        {!hideFooter && <SiteFooter variant="full" />}
        <BackToTop />
      </div>
    </>
  );
}

function getHeaderMenuLocation(navigation: {
  menuSource: string;
  customLocation?: string;
}): string {
  if (navigation.menuSource === "secondary") return "secondary";
  if (navigation.menuSource === "custom") {
    return navigation.customLocation?.trim() || "header";
  }
  return "header";
}
