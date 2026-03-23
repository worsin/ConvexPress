/**
 * EmailStatsCards - Statistics overview cards for the email system.
 *
 * Displays: Total Sent, Failed, Bounced, Queued, and Delivery Rate.
 * Wired to the Convex stats query with a 7-day default window.
 */

import { useQuery } from "convex/react";
import {
  Send,
  AlertTriangle,
  ArrowUpDown,
  Clock,
  TrendingUp,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  subtext?: string;
}

function StatCard({ label, value, icon: Icon, colorClass, subtext }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-2xl font-semibold text-foreground">
              {typeof value === "number" ? value.toLocaleString() : value}
            </span>
            {subtext && (
              <span className="text-xs text-muted-foreground">{subtext}</span>
            )}
          </div>
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-none",
              colorClass,
            )}
          >
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="size-9" />
        </div>
      </CardContent>
    </Card>
  );
}

export function EmailStatsCards() {
  const stats = useQuery(api.emails.queries.stats, {});

  if (stats === undefined) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const deliveryRate =
    stats.totalSent > 0
      ? Math.round(
          (stats.totalSent / (stats.totalSent + stats.totalFailed)) * 100,
        )
      : 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <StatCard
        label="Sent"
        value={stats.totalSent}
        icon={Send}
        colorClass="bg-success/10 text-success"
        subtext="Last 7 days"
      />
      <StatCard
        label="Failed"
        value={stats.totalFailed}
        icon={AlertTriangle}
        colorClass="bg-destructive/10 text-destructive"
        subtext="Last 7 days"
      />
      <StatCard
        label="Bounced"
        value={stats.totalBounced}
        icon={ArrowUpDown}
        colorClass="bg-warning/10 text-warning"
        subtext="Last 7 days"
      />
      <StatCard
        label="Queued"
        value={stats.totalQueued}
        icon={Clock}
        colorClass="bg-warning/10 text-warning"
        subtext="Pending delivery"
      />
      <StatCard
        label="Delivery Rate"
        value={`${deliveryRate}%`}
        icon={TrendingUp}
        colorClass="bg-primary/10 text-primary"
        subtext="Last 7 days"
      />
    </div>
  );
}
