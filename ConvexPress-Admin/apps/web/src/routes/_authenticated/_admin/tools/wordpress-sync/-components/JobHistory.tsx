/**
 * Job History
 *
 * Table of past sync jobs for a site.
 */

import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  Loader2Icon,
  TrashIcon,
  AlertCircleIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate, formatDateTime, formatDuration } from "@/lib/utils";

interface JobHistoryProps {
  siteId: Id<"wordpressSites">;
}

export function JobHistory({ siteId }: JobHistoryProps) {
  // Get job history (excluding active jobs)
  const jobs = useQuery(api.wordpressSync.queries.listJobs, {
    siteId,
    limit: 10,
  });

  const deleteJob = useMutation(api.wordpressSync.mutations.deleteJob);

  const isLoading = jobs === undefined;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sync History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const completedJobs = jobs?.filter(
    (job) => !["running", "paused", "pending"].includes(job.status),
  );

  if (!completedJobs || completedJobs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sync History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <ClockIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No sync history yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleDelete = async (jobId: Id<"wordpressSyncJobs">) => {
    try {
      await deleteJob({ jobId });
      toast.success("Job deleted");
    } catch (error) {
      toast.error("Failed to delete job");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync History</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Imported</TableHead>
              <TableHead>Failed</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {completedJobs.map((job) => {
              // Calculate totals
              const progress = job.progress;
              const imported = Object.values(progress).reduce(
                (sum, p) => sum + p.imported,
                0,
              );
              const failed = Object.values(progress).reduce(
                (sum, p) => sum + p.failed,
                0,
              );

              // Calculate duration
              const duration =
                job.startedAt && job.completedAt
                  ? job.completedAt - job.startedAt
                  : null;

              return (
                <TableRow key={job._id}>
                  <TableCell>
                    <StatusBadge status={job.status} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" title={formatDateTime(job.startedAt)}>
                      {formatDate(job.startedAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {duration ? formatDuration(duration) : "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium text-success">
                      {imported.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    {failed > 0 ? (
                      <span className="text-sm font-medium text-destructive">
                        {failed.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDelete(job._id)}
                    >
                      <TrashIcon className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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
    pending: {
      icon: ClockIcon,
      label: "Pending",
      className: "bg-muted text-muted-foreground",
    },
    running: {
      icon: Loader2Icon,
      label: "Running",
      className: "bg-primary/10 text-primary",
    },
    paused: {
      icon: ClockIcon,
      label: "Paused",
      className: "bg-warning/10 text-warning",
    },
    completed: {
      icon: CheckCircleIcon,
      label: "Completed",
      className: "bg-success/10 text-success",
    },
    failed: {
      icon: XCircleIcon,
      label: "Failed",
      className: "bg-destructive/10 text-destructive",
    },
    cancelled: {
      icon: AlertCircleIcon,
      label: "Cancelled",
      className: "bg-muted text-muted-foreground",
    },
  };

  const { icon: Icon, label, className } = config[status];

  return (
    <Badge variant="outline" className={cn("text-xs gap-1", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
