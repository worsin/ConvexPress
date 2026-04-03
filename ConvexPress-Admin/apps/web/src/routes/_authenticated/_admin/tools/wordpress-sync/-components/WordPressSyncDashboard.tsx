/**
 * WordPress Sync Dashboard
 *
 * Main dashboard showing connected sites, sync stats, and controls.
 * Uses real Convex queries for all data with real-time subscriptions.
 */

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import {
  RefreshCcwIcon,
  PlusIcon,
  Globe2Icon,
  DatabaseIcon,
  ClockIcon,
  AlertTriangleIcon,
} from "lucide-react";

import type { Id } from "@backend/convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { SitesList } from "./SitesList";
import { AddSiteForm } from "./AddSiteDialog";
import { SyncJobCard } from "./SyncJobCard";

/** Shape returned by listSites query (without applicationPassword). */
interface SiteSummary {
  _id: Id<"wordpressSites">;
  name: string;
  siteUrl: string;
  username: string;
  status: "active" | "inactive" | "error";
  lastConnectionTest?: number;
  lastSyncAt?: number;
  connectionError?: string;
  wpVersion?: string;
  siteName?: string;
  siteDescription?: string;
  createdAt: number;
  updatedAt: number;
  activeJob: boolean;
}

export function WordPressSyncDashboard() {
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Fetch sites and overview data (real-time via Convex subscriptions)
  const sites = useQuery(api.wordpressSync.queries.listSites) as
    | SiteSummary[]
    | undefined;
  const overview = useQuery(api.wordpressSync.queries.getOverview);

  const isLoading = sites === undefined || overview === undefined;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <RefreshCcwIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              WordPress Sync
            </h1>
            <p className="text-sm text-muted-foreground">
              Connect WordPress sites and import all content
            </p>
          </div>
        </div>
        {!isAddingNew && (
          <Button onClick={() => setIsAddingNew(true)}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Add WordPress Site
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Globe2Icon}
          label="Connected Sites"
          value={overview.totalSites}
          sublabel={
            overview.activeSites > 0
              ? `${overview.activeSites} active`
              : undefined
          }
        />
        <StatCard
          icon={DatabaseIcon}
          label="Total Imported"
          value={overview.totalImported.toLocaleString()}
          sublabel={
            overview.totalImportedIsApproximate
              ? "10,000+ items synced"
              : "items synced"
          }
        />
        <StatCard
          icon={ClockIcon}
          label="Last Sync"
          value={formatLastSync(overview.lastSyncAt)}
          sublabel={overview.lastSyncSite || undefined}
        />
        <StatCard
          icon={AlertTriangleIcon}
          label="Active Jobs"
          value={overview.activeJobs}
          sublabel={overview.activeJobs > 0 ? "in progress" : "none running"}
          variant={overview.activeJobs > 0 ? "warning" : "default"}
        />
      </div>

      {/* Add Site Form (inline, collapsible) */}
      <AddSiteForm open={isAddingNew} onOpenChange={setIsAddingNew} />

      {/* Active Sync Jobs */}
      {overview.activeJobs > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 text-foreground">
            Active Sync Jobs
          </h2>
          <div className="space-y-3">
            {sites
              .filter((site) => site.activeJob)
              .map((site) => (
                <SyncJobCard
                  key={site._id}
                  siteId={site._id}
                  siteName={site.name}
                  siteUrl={site.siteUrl}
                />
              ))}
          </div>
        </section>
      )}

      {/* Sites List */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-foreground">
          Connected Sites
        </h2>
        {sites.length === 0 && !isAddingNew ? (
          <EmptyState onAddClick={() => setIsAddingNew(true)} />
        ) : sites.length === 0 ? null : (
          <SitesList sites={sites} />
        )}
      </section>
    </div>
  );
}

// ─── Stats Card ──────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sublabel?: string;
  variant?: "default" | "warning";
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  variant = "default",
}: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon
          className={`h-4 w-4 ${variant === "warning" ? "text-warning" : "text-muted-foreground"}`}
        />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {sublabel && (
          <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ onAddClick }: { onAddClick: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
          <Globe2Icon className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">
          No WordPress sites connected
        </h3>
        <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
          Connect your WordPress site to import all content including posts,
          pages, users, media, categories, tags, comments, and menus. Designed
          for WordPress sites built with Elementor.
        </p>
        <Button onClick={onAddClick}>
          <PlusIcon className="mr-2 h-4 w-4" />
          Add WordPress Site
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-10 w-44" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div>
        <Skeleton className="h-6 w-40 mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatLastSync(timestamp?: number): string {
  if (!timestamp) return "Never";

  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60 * 1000) return "Just now";
  if (diff < 60 * 60 * 1000) {
    const mins = Math.floor(diff / (60 * 1000));
    return `${mins} min ago`;
  }
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}h ago`;
  }

  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  return new Date(timestamp).toLocaleDateString();
}
