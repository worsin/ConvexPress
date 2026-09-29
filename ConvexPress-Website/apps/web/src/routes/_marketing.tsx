import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { useUser } from "@/lib/auth/clerk";
import { api } from "@convexpress-website/backend/generated/api";

import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { BackToTop } from "@/components/layout/BackToTop";
import { ContentWrapper } from "@/components/layout/ContentWrapper";
import {
  getBackgroundInertProps,
  LayoutShellProvider,
} from "@/components/layout/LayoutShellProvider";
import { SkipToContent } from "@/components/layout/SkipToContent";
import { WebsiteAdminBar } from "@/components/layout/WebsiteAdminBar";
import { PageOverridesProvider, usePageOverrides } from "@/contexts/PageOverridesContext";
import { useFooterConfig } from "@/hooks/layout/useFooterConfig";
import { useLayoutConfig } from "@/hooks/layout/useLayoutConfig";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { useHeaderConfig } from "@/hooks/layout/useHeaderConfig";
import { useMenuForLocation } from "@/hooks/layout/useMenuForLocation";
import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import { checkRouteAccess } from "@/lib/routeRestriction";
import type { RouteAccessResult } from "@/lib/routeRestriction";
import CoreFooter from "@/templates/packs/core/surfaces/chrome.footer";
import CoreHeader from "@/templates/packs/core/surfaces/chrome.header";
import CoreMobileNav from "@/templates/packs/core/surfaces/chrome.mobileNav";
import CoreNotFound from "@/templates/packs/core/surfaces/system.notFound";
import CoreRestricted from "@/templates/packs/core/surfaces/system.restricted";
import { Surface } from "@/templates/sdk/Surface";

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
  notFoundComponent: MarketingNotFound,
});

/** In-layout 404 (search + links); the active template pack may restyle it. */
function MarketingNotFound() {
  return <Surface name="system.notFound" data={{ kind: "page" }} fallback={CoreNotFound} />;
}

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
 * Applies native inert to the main page content when the mobile nav is open,
 * removing the background from focus and the accessibility tree without an
 * invalid aria-hidden transition on a focused descendant.
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
  const pathname=useLocation({select:location=>location.pathname});
  const routeOwnsBreadcrumbs=/^\/(?:category|tag)\/[^/]+\/?$/.test(pathname)
    // A resume URL contains a bearer credential, not a navigation label.
    || /^\/forms\/[^/]+\/resume\/[^/]+\/?$/.test(pathname);
  const siteIdentity = useSiteIdentity();
  const headerConfig = useHeaderConfig();
  const headerMenu = useMenuForLocation(getHeaderMenuLocation(headerConfig.navigation));
  const layoutConfig = useLayoutConfig();
  const footerConfig = useFooterConfig();
  const { mobileNavOpen, closeMobileNav } = useLayoutShell();
  const { overrides } = usePageOverrides();
  const { user, isLoaded } = useUser();

  const hideHeader = overrides.hideHeader === true;
  const hideFooter = overrides.hideFooter === true;
  const fullWidth = overrides.fullWidth === true;

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
    <Surface
      name="system.restricted"
      data={{
        mode: routeAccess.teaserMode ?? "hide",
        rule: {
          teaserMode: routeAccess.teaserMode,
          customMessage: routeAccess.customMessage,
          matchingPlanIds: routeAccess.matchingPlanIds as any,
        },
        userState,
      }}
      fallback={CoreRestricted}
    />
  ) : (
    <Outlet />
  );

  return (
    <>
      <AnalyticsProvider />
      {/* MobileNav is outside the inert wrapper so focus trap works */}
      {!hideHeader && (
        <Surface
          name="chrome.mobileNav"
          data={{
            menu: headerMenu,
            siteIdentity,
            config: headerConfig.mobileMenu,
            open: mobileNavOpen,
            onClose: closeMobileNav,
          }}
          fallback={CoreMobileNav}
        />
      )}
      <div
        {...getBackgroundInertProps(mobileNavOpen)}
      >
        <SkipToContent />
        <WebsiteAdminBar />
        {!hideHeader && (
          <Surface
            name="chrome.header"
            data={{ siteIdentity, menu: headerMenu, layoutConfig, headerConfig }}
            fallback={CoreHeader}
          />
        )}
        <div className="flex flex-1 flex-col">
          {fullWidth ? (
            <main id="main-content" role="main">{pageContent}</main>
          ) : (
            <ContentWrapper layoutConfig={layoutConfig} showBreadcrumbs={!routeOwnsBreadcrumbs}>
              {pageContent}
            </ContentWrapper>
          )}
        </div>
        {!hideFooter && (
          <Surface
            name="chrome.footer"
            data={{ variant: "full", siteIdentity, footerConfig }}
            fallback={CoreFooter}
          />
        )}
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
