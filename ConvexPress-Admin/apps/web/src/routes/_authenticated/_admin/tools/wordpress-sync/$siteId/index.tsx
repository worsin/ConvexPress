/**
 * WordPress Sync - Site Detail
 *
 * Detailed view for a single WordPress site connection.
 * Shows sync controls, job history, and error logs.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  GlobeIcon,
  ExternalLinkIcon,
  PlayIcon,
  PauseIcon,
  RefreshCcwIcon,
  SettingsIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  AlertTriangleIcon,
  InfoIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

import { SyncProgress } from "../-components/SyncProgress";
import { JobHistory } from "../-components/JobHistory";
import { ErrorLog } from "../-components/ErrorLog";

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/wordpress-sync/$siteId/",
)({
  component: SiteDetailPage,
});

function SiteDetailPage() {
  const { siteId } = Route.useParams();
  const [showDelete, setShowDelete] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Queries
  const site = useQuery(api.wordpressSync.queries.getSite, {
    siteId: siteId as Id<"wordpressSites">,
  });
  const activeJob = useQuery(api.wordpressSync.queries.getActiveJob, {
    siteId: siteId as Id<"wordpressSites">,
  });
  const importStats = useQuery(api.wordpressSync.queries.getImportStats, {
    siteId: siteId as Id<"wordpressSites">,
  });

  // Mutations
  const startSync = useMutation(api.wordpressSync.actions.startSync);
  const resumeSync = useMutation(api.wordpressSync.actions.resumeSync);
  const pauseJob = useMutation(api.wordpressSync.mutations.pauseJob);
  const cancelJob = useMutation(api.wordpressSync.mutations.cancelJob);
  const testConnection = useMutation(
    api.wordpressSync.actions.testSiteConnection,
  );
  const deleteSite = useMutation(api.wordpressSync.mutations.deleteSite);

  const isLoading = site === undefined;

  if (isLoading) {
    return <SiteDetailSkeleton />;
  }

  if (!site) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertTriangleIcon className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Site not found</h2>
        <Link to="/tools/wordpress-sync">
          <Button variant="outline">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to WordPress Sync
          </Button>
        </Link>
      </div>
    );
  }

  const handleStartSync = async () => {
    try {
      await startSync({ siteId: site._id });
      toast.success("Sync started");
    } catch (error) {
      toast.error("Failed to start sync");
    }
  };

  const handlePauseSync = async () => {
    if (!activeJob) return;
    try {
      await pauseJob({ jobId: activeJob._id });
      toast.success("Sync paused");
    } catch (error) {
      toast.error("Failed to pause sync");
    }
  };

  const handleResumeSync = async () => {
    if (!activeJob) return;
    try {
      await resumeSync({ jobId: activeJob._id });
      toast.success("Sync resumed");
    } catch (error) {
      toast.error("Failed to resume sync");
    }
  };

  const handleCancelSync = async () => {
    if (!activeJob) return;
    try {
      await cancelJob({ jobId: activeJob._id });
      toast.success("Sync cancelled");
    } catch (error) {
      toast.error("Failed to cancel sync");
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    try {
      const result = await testConnection({ siteId: site._id });
      if (result.success) {
        toast.success(`Connected! WordPress ${result.wpVersion}`);
      } else {
        toast.error(result.error || "Connection failed");
      }
    } catch (error) {
      toast.error("Failed to test connection");
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSite({ siteId: site._id });
      toast.success("Site removed");
      // Navigate back handled by router
    } catch (error) {
      toast.error("Failed to remove site");
    }
  };

  const hasActiveJob = activeJob && ["running", "paused"].includes(activeJob.status);
  const isPaused = activeJob?.status === "paused";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link
              to="/tools/wordpress-sync"
              className="hover:text-foreground transition-colors"
            >
              WordPress Sync
            </Link>
            <span>/</span>
            <span className="text-foreground">{site.name}</span>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex items-center justify-center w-12 h-12 rounded-lg",
                site.status === "active" && "bg-success/10",
                site.status === "error" && "bg-destructive/10",
                site.status === "inactive" && "bg-muted",
              )}
            >
              <GlobeIcon
                className={cn(
                  "w-6 h-6",
                  site.status === "active" && "text-success",
                  site.status === "error" && "text-destructive",
                  site.status === "inactive" && "text-muted-foreground",
                )}
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {site.name}
              </h1>
              <a
                href={site.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                {site.siteUrl}
                <ExternalLinkIcon className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={isTestingConnection}
          >
            {isTestingConnection ? (
              <RefreshCcwIcon className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCcwIcon className="h-4 w-4 mr-2" />
            )}
            Test Connection
          </Button>

          {hasActiveJob ? (
            <>
              {isPaused ? (
                <Button onClick={handleResumeSync}>
                  <PlayIcon className="h-4 w-4 mr-2" />
                  Resume Sync
                </Button>
              ) : (
                <Button variant="outline" onClick={handlePauseSync}>
                  <PauseIcon className="h-4 w-4 mr-2" />
                  Pause
                </Button>
              )}
              <Button variant="destructive" onClick={handleCancelSync}>
                Cancel
              </Button>
            </>
          ) : (
            <Button onClick={handleStartSync} disabled={site.status === "error"}>
              <PlayIcon className="h-4 w-4 mr-2" />
              Start Sync
            </Button>
          )}
        </div>
      </div>

      {/* Site Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBadge status={site.status} />
            {site.wpVersion && (
              <p className="text-xs text-muted-foreground mt-2">
                WordPress {site.wpVersion}
              </p>
            )}
            {site.connectionError && (
              <p className="text-xs text-destructive mt-2 line-clamp-2">
                {site.connectionError}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last Sync
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {site.lastSyncAt ? formatDate(site.lastSyncAt) : "Never"}
            </p>
            {site.lastSyncAt && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatDateTime(site.lastSyncAt)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Imported Content
            </CardTitle>
          </CardHeader>
          <CardContent>
            {importStats ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Posts:</span>
                  <span className="font-medium">{importStats.posts}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pages:</span>
                  <span className="font-medium">{importStats.pages}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Media:</span>
                  <span className="font-medium">{importStats.media}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Users:</span>
                  <span className="font-medium">{importStats.users}</span>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No content imported yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Active Sync Progress */}
      {hasActiveJob && activeJob && (
        <SyncProgress job={activeJob} />
      )}

      {/* Job History */}
      <JobHistory siteId={site._id} />

      {/* Error Log (if there are errors) */}
      {activeJob && activeJob.errors.length > 0 && (
        <ErrorLog errors={activeJob.errors} />
      )}

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangleIcon className="h-4 w-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Remove this site</p>
              <p className="text-sm text-muted-foreground">
                Remove the connection and all ID mappings. Imported content will
                remain.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setShowDelete(true)}
              disabled={hasActiveJob}
            >
              <TrashIcon className="h-4 w-4 mr-2" />
              Remove Site
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title={`Remove ${site.name}?`}
        message="This will remove the site connection and all ID mappings. Imported content will remain in the database. This action cannot be undone."
        confirmLabel="Remove Site"
        destructive
      />
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "active" | "inactive" | "error" }) {
  const config = {
    active: {
      icon: CheckCircleIcon,
      label: "Connected",
      className: "bg-success/10 text-success border-success/20",
    },
    inactive: {
      icon: InfoIcon,
      label: "Inactive",
      className: "bg-muted text-muted-foreground border-muted-foreground/20",
    },
    error: {
      icon: XCircleIcon,
      label: "Connection Error",
      className: "bg-destructive/10 text-destructive border-destructive/20",
    },
  };

  const { icon: Icon, label, className } = config[status];

  return (
    <Badge variant="outline" className={cn("text-sm gap-1.5", className)}>
      <Icon className="w-4 h-4" />
      {label}
    </Badge>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SiteDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-12 h-12 rounded-lg" />
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
