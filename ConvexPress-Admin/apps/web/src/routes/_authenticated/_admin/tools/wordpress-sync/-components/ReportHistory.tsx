/**
 * Report History
 *
 * Table of past sync reports for a site.
 * Shows status, timing, and aggregate counts.
 */

import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  AlertTriangle,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate } from "@/lib/utils";

interface ReportHistoryProps {
  siteId: Id<"wordpressSites">;
}

function formatReportDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-500" />;
    case "cancelled":
      return <Ban className="w-4 h-4 text-muted-foreground" />;
    default:
      return <Clock className="w-4 h-4 text-amber-500" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; label: string }> = {
    completed: {
      className: "bg-success/10 text-success",
      label: "Completed",
    },
    failed: {
      className: "bg-destructive/10 text-destructive",
      label: "Failed",
    },
    cancelled: {
      className: "bg-muted text-muted-foreground",
      label: "Cancelled",
    },
  };

  const { className, label } = config[status] || {
    className: "bg-muted text-muted-foreground",
    label: status,
  };

  return (
    <Badge variant="outline" className={cn("text-xs gap-1", className)}>
      <StatusIcon status={status} />
      {label}
    </Badge>
  );
}

export function ReportHistory({ siteId }: ReportHistoryProps) {
  const reports = useQuery(api.wordpressSync.queries.listReports, { siteId });

  if (reports === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import Reports</CardTitle>
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

  if (reports.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No import reports yet</p>
            <p className="text-xs mt-1">
              Reports are generated after each import completes
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Reports</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {reports.map((report: any) => (
            <div
              key={report._id}
              className="px-6 py-3 flex justify-between items-center text-sm"
            >
              <div className="flex items-center gap-3">
                <StatusBadge status={report.finalStatus} />
                <span className="text-muted-foreground">
                  {formatReportDate(report.startedAt)}
                </span>
              </div>
              <div className="text-muted-foreground tabular-nums text-xs">
                {report.totalCounts.created} created,{" "}
                {report.totalCounts.updated} updated
                {report.totalCounts.skipped > 0 &&
                  `, ${report.totalCounts.skipped} skipped`}
                {report.totalCounts.failed > 0 &&
                  `, ${report.totalCounts.failed} failed`}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
