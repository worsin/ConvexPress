/**
 * Appearance Layout Route
 *
 * Parent layout route for all Appearance pages (Themes, Customize, Editor).
 * Guards all appearance pages behind the "edit_theme_options" capability
 * (settings.update_general proxy).
 *
 * Only Administrators can access Appearance pages.
 */

import { Outlet, createFileRoute, Link } from "@tanstack/react-router";
import { useCan } from "@/hooks/useCan";
import { useAuth } from "@/lib/auth-context";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/appearance")({
  component: AppearanceLayout,
});

function AppearanceLayout() {
  const { isLoading } = useAuth();
  const canEditTheme = useCan("settings.update_general");

  if (isLoading) {
    return null;
  }

  if (!canEditTheme) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-lg font-semibold mb-2">Access Denied</h1>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          You do not have permission to access Appearance settings. This area is
          restricted to administrators.
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
