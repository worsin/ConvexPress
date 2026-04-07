import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { BackToTop } from "@/components/layout/BackToTop";
import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { LayoutShellProvider } from "@/components/layout/LayoutShellProvider";
import { MobileNav } from "@/components/layout/MobileNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SkipToContent } from "@/components/layout/SkipToContent";
import { ThemeStyleInjector } from "@/components/layout/ThemeStyleInjector";
import { ThemeProvider } from "@/lib/theme-context";
import { WebsiteAdminBar } from "@/components/layout/WebsiteAdminBar";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { PageOverridesProvider, usePageOverrides } from "@/contexts/PageOverridesContext";
import { useLayoutConfig } from "@/hooks/layout/useLayoutConfig";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { useMenuForLocation } from "@/hooks/layout/useMenuForLocation";
import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";

export const Route = createFileRoute("/_marketing")({
  component: MarketingLayout,
  notFoundComponent: NotFoundPage,
});

function MarketingLayout() {
  return (
    <ThemeProvider>
      <LayoutShellProvider>
        <PageOverridesProvider>
          <MarketingLayoutInner />
        </PageOverridesProvider>
      </LayoutShellProvider>
    </ThemeProvider>
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
 */
function MarketingLayoutInner() {
  const siteIdentity = useSiteIdentity();
  const headerMenu = useMenuForLocation("header");
  const layoutConfig = useLayoutConfig();
  const { mobileNavOpen } = useLayoutShell();
  const { overrides } = usePageOverrides();

  const hideHeader = overrides.hideHeader === true;
  const hideFooter = overrides.hideFooter === true;

  return (
    <>
      <AnalyticsProvider />
      <ThemeStyleInjector />
      {/* MobileNav is outside the inert wrapper so focus trap works */}
      {!hideHeader && (
        <MobileNav menu={headerMenu} siteIdentity={siteIdentity} />
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
            <Outlet />
          </ContentWrapper>
        </div>
        {!hideFooter && <SiteFooter variant="full" />}
        <BackToTop />
      </div>
    </>
  );
}
