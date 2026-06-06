import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { ShieldAlert } from "lucide-react";

import { AuthProvider, useAuth } from "@/lib/auth-context";
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
import Loader from "@/components/loader";
import { buttonVariants } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/_admin")({
  component: AdminLayout,
  pendingComponent: AdminShellSkeleton,
});

function AdminLayout() {
  return (
    <AuthProvider>
      <AuthorizedAdminLayout />
    </AuthProvider>
  );
}

function AuthorizedAdminLayout() {
  const location = useLocation();
  const { isLoading, canAccessRoute } = useAuth();
  // Fetch site title from the Settings System
  const generalSettings = useQuery(api.settings.queries.getBySection, {
    section: "general",
  });

  // Derive site title from settings with fallback
  const siteTitle =
    generalSettings && typeof generalSettings === "object" && "siteTitle" in generalSettings
      ? String(generalSettings.siteTitle ?? "ConvexPress")
      : "ConvexPress";
  const hasRouteAccess = canAccessRoute(location.pathname);

  return (
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
                {isLoading ? (
                  <Loader />
                ) : hasRouteAccess ? (
                  <Outlet />
                ) : (
                  <AdminRouteAccessDenied />
                )}
              </AdminContentErrorBoundary>
            </main>
            <AdminFooter />
          </div>
        </div>

        <MobileSidebarOverlay />
      </AdminShellProvider>
    </AdminShellErrorBoundary>
  );
}

function AdminRouteAccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <ShieldAlert className="mb-4 h-12 w-12 text-muted-foreground" />
      <h1 className="mb-2 text-lg font-semibold text-foreground">
        Access Denied
      </h1>
      <p className="mb-6 max-w-md text-sm text-muted-foreground">
        You don't have permission to access this admin page.
      </p>
      <Link
        to="/dashboard"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Return to Dashboard
      </Link>
    </div>
  );
}
