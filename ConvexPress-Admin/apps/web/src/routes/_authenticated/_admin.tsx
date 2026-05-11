import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";

import { AuthProvider } from "@/lib/auth-context";
import { AdminShellProvider } from "@/components/layout/AdminShellProvider";
import { AdminShellErrorBoundary } from "@/components/layout/AdminShellErrorBoundary";
import { AdminContentErrorBoundary } from "@/components/layout/AdminContentErrorBoundary";
import { AdminShellSkeleton } from "@/components/layout/AdminShellSkeleton";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { AdminBar } from "@/components/layout/AdminBar";
import { AdminFooter } from "@/components/layout/AdminFooter";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageTransitionIndicator } from "@/components/layout/PageTransitionIndicator";
import { MobileSidebarOverlay } from "@/components/layout/MobileSidebarOverlay";

export const Route = createFileRoute("/_authenticated/_admin")({
  component: AdminLayout,
  pendingComponent: AdminShellSkeleton,
});

function AdminLayout() {
  const location = useLocation();
  // Fetch site title from the Settings System
  const generalSettings = useQuery(api.settings.queries.getBySection, {
    section: "general",
  });

  // Derive site title from settings with fallback
  const siteTitle =
    generalSettings && typeof generalSettings === "object" && "siteTitle" in generalSettings
      ? String(generalSettings.siteTitle ?? "ConvexPress")
      : "ConvexPress";

  return (
    <AuthProvider>
      <AdminShellErrorBoundary>
        <AdminShellProvider>
          {/* Skip to content link */}
          <a
            href="#admin-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2"
          >
            Skip to main content
          </a>

          <div className="fixed inset-0 flex h-svh overflow-hidden">
            <AdminSidebar />
            <div className="flex flex-1 min-h-0 min-w-0 flex-col">
              <AdminBar siteTitle={siteTitle} />
              <PageTransitionIndicator />
              <main
                id="admin-content"
                role="main"
                className="flex-1 min-h-0 overflow-auto p-6"
              >
                <Breadcrumbs />
                <AdminContentErrorBoundary routeKey={location.pathname}>
                  <Outlet />
                </AdminContentErrorBoundary>
              </main>
              <AdminFooter />
            </div>
          </div>

          <MobileSidebarOverlay />
        </AdminShellProvider>
      </AdminShellErrorBoundary>
    </AuthProvider>
  );
}
