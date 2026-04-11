/**
 * Import Job Card
 *
 * Real-time import progress display for an active job.
 * Shows current phase, progress bars, and controls.
 */

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  UsersIcon,
  FolderTreeIcon,
  ImageIcon,
  FileTextIcon,
  FileIcon,
  MessageSquareIcon,
  MenuIcon,
  CheckCircleIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  XIcon,
  ChevronRightIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface SyncJobCardProps {
  siteId: Id<"wordpressSites">;
  siteName: string;
  siteUrl: string;
}

const PHASE_CONFIG = {
  users: { label: "Users", icon: UsersIcon },
  taxonomies: { label: "Categories & Tags", icon: FolderTreeIcon },
  media: { label: "Media Library", icon: ImageIcon },
  posts: { label: "Posts", icon: FileTextIcon },
  pages: { label: "Pages", icon: FileIcon },
  comments: { label: "Comments", icon: MessageSquareIcon },
  menus: { label: "Navigation Menus", icon: MenuIcon },
  commerceCatalog: { label: "Product Catalog", icon: FileTextIcon },
  commerceTransactions: { label: "Orders & Customers", icon: UsersIcon },
  reconciliation: { label: "Reconciliation", icon: CheckCircleIcon },
  cleanup: { label: "Validation & Cleanup", icon: CheckCircleIcon },
} as const;

type Phase = keyof typeof PHASE_CONFIG;

export function SyncJobCard({ siteId, siteName, siteUrl }: SyncJobCardProps) {
  // Get active job for this site
  const activeJob = useQuery(api.wordpressSync.queries.getActiveJob, {
    siteId,
  });

  // Mutations
  const pauseJob = useMutation(api.wordpressSync.mutations.pauseJob);
  const cancelJob = useMutation(api.wordpressSync.mutations.cancelJob);
  const resumeSync = useAction(api.wordpressSync.actions.resumeSync);

  if (!activeJob) {
    return null;
  }

  const handlePause = async () => {
    try {
      await pauseJob({ jobId: activeJob._id });
      toast.success("Import paused");
    } catch (error) {
      toast.error("Failed to pause import");
    }
  };

  const handleResume = async () => {
    try {
      await resumeSync({ jobId: activeJob._id });
      toast.success("Import resumed");
    } catch (error) {
      toast.error("Failed to resume import");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelJob({ jobId: activeJob._id });
      toast.success("Import cancelled");
    } catch (error) {
      toast.error("Failed to cancel import");
    }
  };

  // Calculate overall progress
  const phases = Object.entries(activeJob.progress) as [
    string,
    { total: number; imported: number; failed: number },
  ][];
  const totalItems = phases.reduce((sum, [, p]) => sum + p.total, 0);
  const completedItems = phases.reduce(
    (sum, [, p]) => sum + p.imported + p.failed,
    0,
  );
  const overallProgress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  const isPaused = activeJob.status === "paused";
  const isRunning = activeJob.status === "running";

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2Icon
              className={cn(
                "h-4 w-4 text-primary",
                isRunning && "animate-spin",
              )}
            />
            <Link
              to="/tools/website-import/$siteId"
              params={{ siteId }}
              className="font-semibold text-foreground hover:text-primary transition-colors"
            >
              {siteName}
            </Link>
            <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {new URL(siteUrl).hostname}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isPaused ? (
              <Button size="sm" variant="outline" onClick={handleResume}>
                <PlayIcon className="h-3 w-3 mr-1" />
                Resume
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={handlePause}>
                <PauseIcon className="h-3 w-3 mr-1" />
                Pause
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleCancel}
            >
              <XIcon className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Overall progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Overall Progress</span>
            <span>
              {completedItems.toLocaleString()} / {totalItems.toLocaleString()}
            </span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>

        {/* Phase progress */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {phases.map(([phase, progress]) => {
            const config = (PHASE_CONFIG as Record<string, { label: string; icon: typeof CheckCircleIcon }>)[phase] ?? {
              label: phase.charAt(0).toUpperCase() + phase.slice(1),
              icon: CheckCircleIcon,
            };
            const Icon = config.icon;
            const isCurrent = activeJob.currentPhase === phase;
            const isComplete =
              progress.imported + progress.failed >= progress.total &&
              progress.total > 0;
            const phaseProgress =
              progress.total > 0
                ? ((progress.imported + progress.failed) / progress.total) * 100
                : 0;

            return (
              <div
                key={phase}
                className={cn(
                  "p-2 rounded-lg border",
                  isCurrent && "border-primary bg-primary/5",
                  isComplete && "border-success/30 bg-success/5",
                  !isCurrent && !isComplete && "border-border",
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {isComplete ? (
                    <CheckCircleIcon className="h-3 w-3 text-success" />
                  ) : isCurrent && isRunning ? (
                    <Loader2Icon className="h-3 w-3 text-primary animate-spin" />
                  ) : (
                    <Icon className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isCurrent && "text-primary",
                      isComplete && "text-success",
                      !isCurrent && !isComplete && "text-muted-foreground",
                    )}
                  >
                    {config.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress
                    value={phaseProgress}
                    className={cn(
                      "h-1 flex-1",
                      isComplete && "[&>div]:bg-success",
                    )}
                  />
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {progress.imported}/{progress.total}
                  </span>
                </div>
                {progress.failed > 0 && (
                  <span className="text-[10px] text-destructive">
                    {progress.failed} failed
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Status message */}
        {isPaused && (
          <div className="mt-3 text-xs text-warning bg-warning/10 rounded px-2 py-1.5">
            Import is paused. Click Resume to continue.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
