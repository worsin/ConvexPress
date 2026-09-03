/**
 * Dashboard System - Admin Dashboard
 *
 * Main container component that orchestrates:
 *   - Page header (site identity, environment, health, primary actions)
 *   - Welcome panel (dismissable)
 *   - Screen Options (widget visibility toggle)
 *   - Widget grid (two-column layout with drag-and-drop)
 *
 * Reads user capabilities to filter which widgets are shown.
 * All data is fetched reactively via Convex subscriptions.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { Archive, Plus } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EnvironmentChip, HealthDot } from "@/components/shell/EnvironmentChip";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  environmentDisplayName,
  environmentStatusText,
  originHostname,
} from "@/components/shell/environment-presentation";
import { useControlShell } from "@/control/ControlShellContext";
import { DashboardScreenOptions } from "./ScreenOptions";
import { WelcomePanel } from "./WelcomePanel";
import { WidgetGrid } from "./WidgetGrid";
import { useWidgetPreferences } from "@/hooks/dashboard/useWidgetPreferences";

export function AdminDashboard() {
  const shell = useControlShell();

  // ── User data ───────────────────────────────────────────────────────────

  const currentUser = useQuery(api.profiles.queries.getProfile);
  const userRole = useQuery(
    api.roles.queries.getRole,
    currentUser?.roleId ? { roleId: currentUser.roleId } : "skip",
  );
  const generalSettings = useQuery(api.settings.queries.getBySection, {
    section: "general",
  });

  const userCapabilities: string[] =
    (userRole as { capabilities?: string[] } | null | undefined)?.capabilities ?? [];
  const displayName =
    shell?.operator.displayName ??
    currentUser?.displayName ??
    currentUser?.firstName ??
    currentUser?.email ??
    undefined;
  const siteTitle =
    generalSettings && typeof generalSettings === "object" && "siteTitle" in generalSettings
      ? String((generalSettings as { siteTitle?: string }).siteTitle ?? "")
      : "";

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

  const environment = shell?.selectedEnvironment ?? null;
  const website = shell?.selectedWebsite ?? null;
  const business = shell?.selectedBusiness ?? null;
  const title = website?.title || siteTitle || "Dashboard";
  const canCreatePosts = userCapabilities.includes("post.create");

  const eyebrow = shell
    ? [business?.name, environment ? `${environmentDisplayName(environment)} environment` : null]
        .filter(Boolean)
        .join(" · ")
    : "Dashboard";

  const meta = shell && environment
    ? [
        <span key="health" className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <HealthDot environment={environment} />
          {environmentStatusText(environment).split(" · ")[0]}
        </span>,
        <span key="contract">{environmentStatusText(environment).split(" · ")[1]}</span>,
        <span key="origin" className="font-mono text-[12px] text-muted-foreground">
          {originHostname(environment.deploymentOrigin)}
        </span>,
      ]
    : displayName
      ? [<span key="welcome">Welcome back, {displayName}</span>]
      : [];

  return (
    <div className="space-y-[18px]">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        chip={environment ? <EnvironmentChip environment={environment} /> : undefined}
        meta={meta}
        actions={
          <>
            {shell?.visibility.operations && (
              <Button variant="outline" onClick={() => shell.setOpenPanel("operations")}>
                <Archive data-icon="inline-start" aria-hidden="true" />
                Back up now
              </Button>
            )}
            {canCreatePosts && (
              <Link to="/posts/new" className={buttonVariants({ variant: "default" })}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                New post
              </Link>
            )}
          </>
        }
      />

      <div className="-mt-2">
        <DashboardScreenOptions
          hiddenWidgets={prefs.hiddenWidgets}
          userCapabilities={userCapabilities}
          onRestoreWidget={restoreWidget}
          onDismissWidget={dismissWidget}
        />
      </div>

      {!prefs.welcomeDismissed && (
        <WelcomePanel
          displayName={displayName}
          userCapabilities={userCapabilities}
          onDismiss={dismissWelcome}
        />
      )}

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
      <Skeleton className="mb-2 h-3 w-40" />
      <Skeleton className="mb-7 h-9 w-72" />
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-3.5">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <div className="space-y-3.5">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
