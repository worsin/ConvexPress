/**
 * Import Progress
 *
 * Detailed real-time import progress display.
 * Shows all phases with progress bars, item counts, status icons, and timing.
 * Updates in real-time via Convex reactive queries.
 */

import { useEffect, useState } from "react";
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
  XCircleIcon,
  PauseCircleIcon,
  CircleDotIcon,
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
  status:
    | "pending"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "cancelled";
  currentPhase: string;
  progress: Record<string, PhaseProgress>;
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
  media: { label: "Media Library", icon: ImageIcon, order: 4 },
  posts: { label: "Posts", icon: FileTextIcon, order: 5 },
  pages: { label: "Pages", icon: FileIcon, order: 6 },
  comments: { label: "Comments", icon: MessageSquareIcon, order: 7 },
  menus: { label: "Navigation Menus", icon: MenuIcon, order: 8 },
  commerceCatalog: { label: "Product Catalog", icon: FileTextIcon, order: 9 },
  commerceTransactions: { label: "Orders & Customers", icon: UsersIcon, order: 10 },
  reconciliation: { label: "Reconciliation", icon: CheckCircleIcon, order: 11 },
  cleanup: { label: "Validation & Cleanup", icon: CheckCircleIcon, order: 12 },
} as const;

type Phase = keyof typeof PHASE_CONFIG;

export function SyncProgress({ job }: SyncProgressProps) {
  // Live elapsed timer
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (job.status !== "running") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [job.status]);

  // Calculate overall progress
  //
  // Item-count progress (sum of imported / sum of total) is misleading early
  // in the run because phases that haven't started yet have total=0 and so
  // don't contribute to the denominator. The percentage looks artificially
  // high (e.g. "100% complete" when only users + taxonomies have started).
  //
  // Instead we use phase-weighted progress: each phase that's in scope gets
  // an equal slice of the bar. Completed phases contribute 1.0; the current
  // phase contributes its own fractional progress; pending phases contribute
  // 0. The item counts are still shown alongside as a secondary metric.
  const phases = Object.entries(job.progress) as [string, PhaseProgress][];
  const importedItems = phases.reduce((sum, [, p]) => sum + p.imported, 0);
  const failedItems = phases.reduce((sum, [, p]) => sum + p.failed, 0);
  const totalKnownItems = phases.reduce((sum, [, p]) => sum + p.total, 0);

  const phaseFractions = phases.map(([phase, p]) => {
    const isComplete =
      p.total > 0 && p.imported + p.failed >= p.total;
    const isCurrent = job.currentPhase === phase;
    if (isComplete) return 1;
    if (isCurrent && p.total > 0) {
      return Math.min(1, (p.imported + p.failed) / p.total);
    }
    return 0;
  });
  const totalPhaseSlots = phases.length || 1;
  const overallProgressRaw =
    (phaseFractions.reduce((a, b) => a + b, 0) / totalPhaseSlots) * 100;
  // Show 99% when very close but not actually done — only show 100% when
  // every phase reports complete or the job status itself is "completed".
  const allPhasesComplete = phaseFractions.every((f) => f === 1);
  const overallProgress =
    job.status === "completed" || allPhasesComplete
      ? 100
      : Math.min(99, Math.floor(overallProgressRaw));
  const completedPhasesCount = phaseFractions.filter((f) => f === 1).length;

  // Calculate elapsed time
  const startedAt = job.startedAt;
  const endedAt = job.completedAt || (job.status === "running" ? now : job.pausedAt);
  const elapsed = startedAt && endedAt ? endedAt - startedAt : 0;

  // Sort phases by order (unknown phases go to the end)
  const phaseOrders = PHASE_CONFIG as Record<string, { order: number }>;
  const sortedPhases = [...phases].sort(([a], [b]) => {
    const orderA = phaseOrders[a]?.order ?? 999;
    const orderB = phaseOrders[b]?.order ?? 999;
    return orderA - orderB;
  });

  // Get current phase index
  const currentPhaseIndex = sortedPhases.findIndex(
    ([phase]) => phase === job.currentPhase,
  );

  const isFinished = ["completed", "failed", "cancelled"].includes(job.status);

  return (
    <Card
      className={cn(
        isFinished && job.status === "completed" && "border-success/30",
        isFinished && job.status === "failed" && "border-destructive/30",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <JobStatusIcon status={job.status} />
            {isFinished ? "Import Result" : "Import Progress"}
          </CardTitle>
          <div className="flex items-center gap-3">
            {startedAt && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {formatDuration(elapsed)}
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
            <span className="text-muted-foreground tabular-nums">
              Phase {Math.min(completedPhasesCount + 1, totalPhaseSlots)} of{" "}
              {totalPhaseSlots}
              <span className="text-foreground/60 ml-2">
                ·{" "}
                {importedItems.toLocaleString()} of{" "}
                {totalKnownItems.toLocaleString()} known items
              </span>
              {failedItems > 0 && (
                <span className="text-destructive ml-2">
                  ({failedItems} failed)
                </span>
              )}
            </span>
          </div>
          <Progress
            value={overallProgress}
            className={cn(
              "h-3",
              job.status === "completed" && "[&>div]:bg-success",
              job.status === "failed" && "[&>div]:bg-destructive",
            )}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {overallProgress}% complete
            {job.status === "running" && totalKnownItems > 0 && (
              <span className="ml-2">
                · totals update as phases start
              </span>
            )}
          </p>
        </div>

        {/* Phase Progress Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedPhases.map(([phase, progress], index) => {
            const config = (PHASE_CONFIG as Record<string, { label: string; icon: typeof CheckCircleIcon; order: number }>)[phase] ?? {
              label: phase.charAt(0).toUpperCase() + phase.slice(1),
              icon: CheckCircleIcon,
              order: 999,
            };
            const isCurrent = job.currentPhase === phase;
            const isComplete =
              progress.imported + progress.failed >= progress.total &&
              progress.total > 0;
            const isPending = !isFinished && index > currentPhaseIndex;
            const hasErrors = progress.failed > 0;
            const phaseProgress =
              progress.total > 0
                ? ((progress.imported + progress.failed) / progress.total) * 100
                : 0;

            return (
              <PhaseCard
                key={phase}
                label={config.label}
                icon={config.icon}
                progress={progress}
                phaseProgress={phaseProgress}
                isCurrent={isCurrent}
                isComplete={isComplete}
                isPending={isPending}
                hasErrors={hasErrors}
                jobStatus={job.status}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Phase Card ──────────────────────────────────────────────────────────────

interface PhaseCardProps {
  label: string;
  icon: React.ElementType;
  progress: PhaseProgress;
  phaseProgress: number;
  isCurrent: boolean;
  isComplete: boolean;
  isPending: boolean;
  hasErrors: boolean;
  jobStatus: string;
}

function PhaseCard({
  label,
  icon: Icon,
  progress,
  phaseProgress,
  isCurrent,
  isComplete,
  isPending,
  hasErrors,
  jobStatus,
}: PhaseCardProps) {
  return (
    <div
      className={cn(
        "p-4 rounded-lg border transition-colors",
        isCurrent && jobStatus === "running" && "border-primary bg-primary/5",
        isCurrent && jobStatus === "paused" && "border-warning bg-warning/5",
        isComplete && !hasErrors && "border-success/30 bg-success/5",
        isComplete && hasErrors && "border-warning/30 bg-warning/5",
        isPending && "opacity-50",
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <PhaseStatusIcon
            isCurrent={isCurrent}
            isComplete={isComplete}
            isPending={isPending}
            hasErrors={hasErrors}
            jobStatus={jobStatus}
            icon={Icon}
          />
          <span
            className={cn(
              "font-medium text-sm",
              isCurrent && jobStatus === "running" && "text-primary",
              isComplete && !hasErrors && "text-success",
              isComplete && hasErrors && "text-warning",
              isPending && "text-muted-foreground",
            )}
          >
            {label}
          </span>
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">
          {progress.imported}
          {progress.total > 0 && ` / ${progress.total}`}
        </span>
      </div>

      <Progress
        value={phaseProgress}
        className={cn(
          "h-2",
          isComplete && !hasErrors && "[&>div]:bg-success",
          isComplete && hasErrors && "[&>div]:bg-warning",
        )}
      />

      {/* Phase stats */}
      <div className="flex items-center justify-between mt-2">
        {hasErrors ? (
          <span className="text-xs text-destructive">
            {progress.failed} failed
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {isComplete
              ? "Complete"
              : isPending
                ? "Pending"
                : isCurrent
                  ? jobStatus === "paused"
                    ? "Paused"
                    : "In progress..."
                  : ""}
          </span>
        )}
        {progress.total > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {Math.round(phaseProgress)}%
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Phase Status Icon ───────────────────────────────────────────────────────

function PhaseStatusIcon({
  isCurrent,
  isComplete,
  isPending,
  hasErrors,
  jobStatus,
  icon: FallbackIcon,
}: {
  isCurrent: boolean;
  isComplete: boolean;
  isPending: boolean;
  hasErrors: boolean;
  jobStatus: string;
  icon: React.ElementType;
}) {
  if (isComplete && !hasErrors) {
    return <CheckCircleIcon className="h-4 w-4 text-success" />;
  }
  if (isComplete && hasErrors) {
    return <XCircleIcon className="h-4 w-4 text-warning" />;
  }
  if (isCurrent && jobStatus === "running") {
    return <Loader2Icon className="h-4 w-4 text-primary animate-spin" />;
  }
  if (isCurrent && jobStatus === "paused") {
    return <PauseCircleIcon className="h-4 w-4 text-warning" />;
  }
  if (isPending) {
    return <CircleDotIcon className="h-4 w-4 text-muted-foreground/50" />;
  }
  return <FallbackIcon className="h-4 w-4 text-muted-foreground" />;
}

// ─── Job Status Icon ─────────────────────────────────────────────────────────

function JobStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "running":
      return <Loader2Icon className="h-4 w-4 text-primary animate-spin" />;
    case "paused":
      return <PauseCircleIcon className="h-4 w-4 text-warning" />;
    case "completed":
      return <CheckCircleIcon className="h-4 w-4 text-success" />;
    case "failed":
      return <XCircleIcon className="h-4 w-4 text-destructive" />;
    case "cancelled":
      return <XCircleIcon className="h-4 w-4 text-muted-foreground" />;
    default:
      return <ClockIcon className="h-4 w-4 text-muted-foreground" />;
  }
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({
  status,
}: {
  status:
    | "pending"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "cancelled";
}) {
  const config = {
    pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
    running: { label: "Running", className: "bg-primary/10 text-primary" },
    paused: { label: "Paused", className: "bg-warning/10 text-warning" },
    completed: { label: "Completed", className: "bg-success/10 text-success" },
    failed: {
      label: "Failed",
      className: "bg-destructive/10 text-destructive",
    },
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
