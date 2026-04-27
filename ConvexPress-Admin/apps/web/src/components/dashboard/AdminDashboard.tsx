/**
 * Dashboard System - Admin Dashboard
 *
 * Main container component that orchestrates:
 *   - Welcome panel (dismissable)
 *   - Screen Options (widget visibility toggle)
 *   - Widget grid (two-column layout with drag-and-drop)
 *
 * Reads user capabilities to filter which widgets are shown.
 * All data is fetched reactively via Convex subscriptions.
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardScreenOptions } from "./ScreenOptions";
import { WelcomePanel } from "./WelcomePanel";
import { WidgetGrid } from "./WidgetGrid";
import { useWidgetPreferences } from "@/hooks/dashboard/useWidgetPreferences";

export function AdminDashboard() {
  // ── User data ───────────────────────────────────────────────────────────

  const currentUser = useQuery(api.profiles.queries.getProfile);

  // Get user capabilities from their role.
  // Convex useQuery supports "skip" to conditionally skip the query.
  const userRole = useQuery(
    api.roles.queries.getRole,
    currentUser?.roleId ? { roleId: currentUser.roleId } : "skip",
  );

  const userCapabilities: string[] =
    (userRole as { capabilities?: string[] } | null | undefined)?.capabilities ?? [];
  const displayName =
    currentUser?.displayName ??
    currentUser?.firstName ??
    currentUser?.email ??
    undefined;

  // ── Widget preferences ──────────────────────────────────────────────────

  const {
    prefs,
    isLoading: prefsLoading,
    dismissWidget,
    restoreWidget,
    toggleCollapse,
    reorderWidgets,
    dismissWelcome,
  } = useWidgetPreferences("admin");

  // ── Loading state ───────────────────────────────────────────────────────

  if (currentUser === undefined || prefsLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      </div>

      {/* Screen Options */}
      <DashboardScreenOptions
        hiddenWidgets={prefs.hiddenWidgets}
        userCapabilities={userCapabilities}
        onRestoreWidget={restoreWidget}
        onDismissWidget={dismissWidget}
      />

      {/* Welcome Panel */}
      {!prefs.welcomeDismissed && (
        <WelcomePanel
          displayName={displayName}
          userCapabilities={userCapabilities}
          onDismiss={dismissWelcome}
        />
      )}

      {/* Widget Grid */}
      <WidgetGrid
        prefs={prefs}
        userCapabilities={userCapabilities}
        onToggleCollapse={toggleCollapse}
        onReorder={reorderWidgets}
      />
    </div>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div>
      <Skeleton className="h-8 w-40 mb-6" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    </div>
  );
}
