/**
 * SEO Layout Route
 *
 * Parent layout route for all SEO pages. Guards all SEO pages behind
 * the "manage_options" capability. Only users with "manage_options"
 * (typically Administrators) can view SEO settings and overview.
 */

import { Outlet, createFileRoute, Link } from "@tanstack/react-router";
import { useCan } from "@/hooks/useCan";
import { useAuth } from "@/lib/auth-context";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/seo")({
  component: SeoLayout,
});

function SeoLayout() {
  const { isLoading } = useAuth();
  const canManageOptions = useCan("manage_options");

  // While auth data is loading, show nothing (avoid flash of denied state)
  if (isLoading) {
    return null;
  }

  // If the user doesn't have the manage_options capability, show access denied
  if (!canManageOptions) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-lg font-semibold mb-2">Access Denied</h1>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          You do not have permission to access SEO settings. This area is
          restricted to administrators with the "manage_options" capability.
        </p>
        <Link
          to="/dashboard"
          className="inline-flex items-center px-4 py-2 text-sm font-medium border border-input bg-card hover:bg-accent transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return <Outlet />;
}
