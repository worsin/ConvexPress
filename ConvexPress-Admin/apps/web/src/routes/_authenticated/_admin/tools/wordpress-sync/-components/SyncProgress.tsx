/**
 * Sync Progress
 *
 * Detailed real-time sync progress display.
 * Shows all phases with progress bars and stats.
 */

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
  ClockIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn, formatDuration } from "@/lib/utils";

interface PhaseProgress {
  total: number;
  imported: number;
  failed: number;
  cursor?: number;
}

interface Job {
  _id: string;
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  currentPhase: string;
  progress: {
    users: PhaseProgress;
    categories: PhaseProgress;
    tags: PhaseProgress;
    media: PhaseProgress;
    posts: PhaseProgress;
    pages: PhaseProgress;
    comments: PhaseProgress;
    menus: PhaseProgress;
  };
  startedAt?: number;
  completedAt?: number;
  pausedAt?: number;
}

interface SyncProgressProps {
  job: Job;
}

const PHASE_CONFIG = {
  users: { label: "Users", icon: UsersIcon, order: 1 },
  categories: { label: "Categories", icon: FolderTreeIcon, order: 2 },
  tags: { label: "Tags", icon: FolderTreeIcon, order: 3 },
  media: { label: "Media", icon: ImageIcon, order: 4 },
  posts: { label: "Posts", icon: FileTextIcon, order: 5 },
  pages: { label: "Pages", icon: FileIcon, order: 6 },
  comments: { label: "Comments", icon: MessageSquareIcon, order: 7 },
  menus: { label: "Menus", icon: MenuIcon, order: 8 },
} as const;

type Phase = keyof typeof PHASE_CONFIG;

export function SyncProgress({ job }: SyncProgressProps) {
  // Calculate overall progress
  const phases = Object.entries(job.progress) as [Phase, PhaseProgress][];
  const totalItems = phases.reduce((sum, [, p]) => sum + p.total, 0);
  const completedItems = phases.reduce(
    (sum, [, p]) => sum + p.imported + p.failed,
    0,
  );
  const failedItems = phases.reduce((sum, [, p]) => sum + p.failed, 0);
  const overallProgress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  // Calculate elapsed time
  const startedAt = job.startedAt;
  const elapsed = startedAt ? Date.now() - startedAt : 0;

  // Sort phases by order
  const sortedPhases = [...phases].sort(
    ([a], [b]) => PHASE_CONFIG[a].order - PHASE_CONFIG[b].order,
  );

  // Get current phase index
  const currentPhaseIndex = sortedPhases.findIndex(
    ([phase]) => phase === job.currentPhase,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {job.status === "running" ? (
              <Loader2Icon className="h-4 w-4 text-primary animate-spin" />
            ) : job.status === "paused" ? (
              <ClockIcon className="h-4 w-4 text-warning" />
            ) : (
              <CheckCircleIcon className="h-4 w-4 text-success" />
            )}
            Sync Progress
          </CardTitle>
          <div className="flex items-center gap-3">
            {startedAt && (
              <span className="text-sm text-muted-foreground">
                Elapsed: {formatDuration(elapsed)}
              </span>
            )}
            <StatusBadge status={job.status} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium">Overall Progress</span>
            <span className="text-muted-foreground">
              {completedItems.toLocaleString()} / {totalItems.toLocaleString()}
              {failedItems > 0 && (
                <span className="text-destructive ml-2">
                  ({failedItems} failed)
                </span>
              )}
            </span>
          </div>
          <Progress value={overallProgress} className="h-3" />
          <p className="text-xs text-muted-foreground mt-1">
            {Math.round(overallProgress)}% complete
          </p>
        </div>

        {/* Phase Progress */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedPhases.map(([phase, progress], index) => {
            const config = PHASE_CONFIG[phase];
            const Icon = config.icon;
            const isCurrent = job.currentPhase === phase;
            const isComplete =
              progress.imported + progress.failed >= progress.total &&
              progress.total > 0;
            const isPending = index > currentPhaseIndex;
            const phaseProgress =
              progress.total > 0
                ? ((progress.imported + progress.failed) / progress.total) * 100
                : 0;

            return (
              <div
                key={phase}
                className={cn(
                  "p-4 rounded-lg border transition-colors",
                  isCurrent && job.status === "running" && "border-primary bg-primary/5",
                  isCurrent && job.status === "paused" && "border-warning bg-warning/5",
                  isComplete && "border-success/30 bg-success/5",
                  isPending && "opacity-50",
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {isComplete ? (
                      <CheckCircleIcon className="h-4 w-4 text-success" />
                    ) : isCurrent && job.status === "running" ? (
                      <Loader2Icon className="h-4 w-4 text-primary animate-spin" />
                    ) : (
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span
                      className={cn(
                        "font-medium",
                        isCurrent && "text-primary",
                        isComplete && "text-success",
                      )}
                    >
                      {config.label}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {progress.imported} / {progress.total}
                  </span>
                </div>

                <Progress
                  value={phaseProgress}
                  className={cn("h-2", isComplete && "[&>div]:bg-success")}
                />

                {progress.failed > 0 && (
                  <p className="text-xs text-destructive mt-2">
                    {progress.failed} failed
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({
  status,
}: {
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
}) {
  const config = {
    pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
    running: { label: "Running", className: "bg-primary/10 text-primary" },
    paused: { label: "Paused", className: "bg-warning/10 text-warning" },
    completed: { label: "Completed", className: "bg-success/10 text-success" },
    failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
    cancelled: {
      label: "Cancelled",
      className: "bg-muted text-muted-foreground",
    },
  };

  const { label, className } = config[status];

  return (
    <Badge variant="outline" className={cn("text-xs", className)}>
      {label}
    </Badge>
  );
}
