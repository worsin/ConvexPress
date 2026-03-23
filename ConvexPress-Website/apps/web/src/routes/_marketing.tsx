import { createFileRoute, Outlet } from "@tanstack/react-router";

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
        <MarketingLayoutInner />
      </LayoutShellProvider>
    </ThemeProvider>
  );
}

/**
 * Inner layout component that can access LayoutShellProvider context.
 * Applies aria-hidden and inert to the main page content when
 * mobile nav is open for WCAG 2.1 AA compliance (finding #163).
 */
function MarketingLayoutInner() {
  const siteIdentity = useSiteIdentity();
  const headerMenu = useMenuForLocation("header");
  const layoutConfig = useLayoutConfig();
  const { mobileNavOpen } = useLayoutShell();

  return (
    <>
      <ThemeStyleInjector />
      {/* MobileNav is outside the inert wrapper so focus trap works */}
      <MobileNav menu={headerMenu} siteIdentity={siteIdentity} />
      <div
        aria-hidden={mobileNavOpen || undefined}
        {...(mobileNavOpen ? { inert: true } : {})}
      >
        <SkipToContent />
        <WebsiteAdminBar />
        <SiteHeader
          siteIdentity={siteIdentity}
          menu={headerMenu}
          layoutConfig={layoutConfig}
        />
        <div className="flex flex-1 flex-col">
          <ContentWrapper layoutConfig={layoutConfig}>
            <Outlet />
          </ContentWrapper>
        </div>
        <SiteFooter variant="full" />
        <BackToTop />
      </div>
    </>
  );
}
