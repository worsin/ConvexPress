import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";

import { LoginTracker } from "@/components/auth/LoginTracker";
import { DashboardMobileNav } from "@/components/layout/DashboardMobileNav";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { LayoutShellProvider } from "@/components/layout/LayoutShellProvider";
import { MobileNav } from "@/components/layout/MobileNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SkipToContent } from "@/components/layout/SkipToContent";
import { useMenuForLocation } from "@/hooks/layout/useMenuForLocation";
import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import { ThemeProvider } from "@/lib/theme-context";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const siteIdentity = useSiteIdentity();
  const headerMenu = useMenuForLocation("header");

  // Redirect unauthenticated users to login
	  useEffect(() => {
	    if (isLoaded && !isSignedIn) {
	      navigate({ to: "/login" } as any);
	    }
	  }, [isLoaded, isSignedIn, navigate]);

  // Don't render dashboard content until auth is loaded and confirmed
  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <ThemeProvider>
    <LayoutShellProvider>
        <SkipToContent />
        <SiteHeader siteIdentity={siteIdentity} menu={headerMenu} />
        <MobileNav menu={headerMenu} siteIdentity={siteIdentity} />
        <DashboardMobileNav />
        <div className="flex flex-1">
          <DashboardSidebar />
          <main
            id="main-content"
            role="main"
            className="min-h-[calc(100svh-4rem)] flex-1 overflow-auto p-6"
          >
            <Outlet />
          </main>
        </div>
        <SiteFooter variant="minimal" />
        <LoginTracker />
    </LayoutShellProvider>
    </ThemeProvider>
  );
}
