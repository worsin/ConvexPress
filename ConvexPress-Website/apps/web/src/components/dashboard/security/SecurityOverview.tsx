/**
 * Security Overview Component
 *
 * Displays the user's login history, failed login attempts against their
 * account, and security statistics on their dashboard Security page.
 *
 * Data comes from the authTracking/queries.getSecurityOverview query
 * which returns both successful logins and failed attempts.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Globe,
  Monitor,
  Shield,
  Smartphone,
} from "lucide-react";

import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Helper: Parse User Agent ──────────────────────────────────────────────

function parseUserAgent(ua?: string): { device: string; browser: string } {
  if (!ua) return { device: "Unknown device", browser: "Unknown browser" };

  let device = "Desktop";
  if (/mobile/i.test(ua)) device = "Mobile";
  else if (/tablet|ipad/i.test(ua)) device = "Tablet";

  let browser = "Unknown browser";
  if (/firefox/i.test(ua)) browser = "Firefox";
  else if (/edg/i.test(ua)) browser = "Edge";
  else if (/chrome/i.test(ua)) browser = "Chrome";
  else if (/safari/i.test(ua)) browser = "Safari";
  else if (/opera|opr/i.test(ua)) browser = "Opera";

  return { device, browser };
}

// ─── Helper: Format Timestamp ──────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function formatFullTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Helper: Failure reason label ──────────────────────────────────────────

function getFailureLabel(reason: string): string {
  switch (reason) {
    case "invalid_credentials":
      return "Invalid credentials";
    case "account_locked":
      return "Account locked";
    case "account_deactivated":
      return "Account deactivated";
    case "account_banned":
      return "Account banned";
    case "mfa_failed":
      return "MFA failed";
    case "rate_limited":
      return "Rate limited";
    default:
      return "Unknown error";
  }
}

// ─── Device Icon ───────────────────────────────────────────────────────────

function DeviceIcon({
  userAgent,
  className,
}: {
  userAgent?: string;
  className?: string;
}) {
  const { device } = parseUserAgent(userAgent);
  if (device === "Mobile" || device === "Tablet") {
    return <Smartphone className={className} />;
  }
  return <Monitor className={className} />;
}

// ─── Main Component ────────────────────────────────────────────────────────

export function SecurityOverview() {
  const securityData = useQuery(
    api.authTracking.queries.getSecurityOverview,
    { loginLimit: 20, failedLimit: 10 },
  );

  if (securityData === undefined) {
    return <SecurityOverviewSkeleton />;
  }

  if (securityData === null) {
    return (
      <EmptyState
        icon={Shield}
        title="Unable to load security data"
        description="Please try refreshing the page."
      />
    );
  }

  const { logins, failures, lastLoginAt } = securityData;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Last Login"
          value={lastLoginAt ? formatTimestamp(lastLoginAt) : "Never"}
          icon={Clock}
        />
        <StatCard
          label="Recent Logins"
          value={String(logins.length)}
          icon={CheckCircle}
          variant="success"
        />
        <StatCard
          label="Failed Attempts"
          value={String(failures.length)}
          icon={AlertTriangle}
          variant={failures.length > 0 ? "warning" : "default"}
        />
      </div>

      {/* Failed Login Attempts (show prominently if any exist) */}
      {failures.length > 0 && (
        <DashboardCard
          title="Failed Login Attempts"
          description="Unsuccessful login attempts using your email address."
        >
          <div className="space-y-0">
            {failures.map((failure: typeof failures[number]) => (
              <div
                key={failure.id}
                className="flex items-start gap-3 border-b border-border/50 py-3 last:border-b-0"
              >
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center bg-destructive/10">
                  <AlertTriangle className="size-3.5 text-destructive" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-foreground">
                      {getFailureLabel(failure.reason)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {failure.app !== "unknown" ? `via ${failure.app}` : ""}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span
                      title={formatFullTimestamp(failure.timestamp)}
                    >
                      {formatTimestamp(failure.timestamp)}
                    </span>
                    {failure.ip && (
                      <span className="flex items-center gap-1">
                        <Globe className="size-2.5" />
                        {failure.ip}
                      </span>
                    )}
                    {failure.userAgent && (
                      <span className="flex items-center gap-1">
                        <DeviceIcon
                          userAgent={failure.userAgent}
                          className="size-2.5"
                        />
                        {parseUserAgent(failure.userAgent).browser} on{" "}
                        {parseUserAgent(failure.userAgent).device}
                      </span>
                    )}
                  </div>
                  {failure.description && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                      {failure.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>
      )}

      {/* Login History */}
      <DashboardCard
        title="Login History"
        description="Your recent sign-in activity."
      >
        {logins.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="No login history yet"
            description="Your sign-in activity will appear here."
          />
        ) : (
          <div className="space-y-0">
            {logins.map((login: typeof logins[number]) => {
              const { device, browser } = parseUserAgent(login.userAgent);

              return (
                <div
                  key={login.id}
                  className="flex items-start gap-3 border-b border-border/50 py-3 last:border-b-0"
                >
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center bg-muted">
                    <DeviceIcon
                      userAgent={login.userAgent}
                      className="size-3.5 text-muted-foreground"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {browser} on {device}
                      </span>
                      {login.method && login.method !== "unknown" && (
                        <span className="text-[10px] text-muted-foreground">
                          via {login.method}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                      <span
                        title={formatFullTimestamp(login.timestamp)}
                      >
                        {formatTimestamp(login.timestamp)}
                      </span>
                      {login.ip && (
                        <span className="flex items-center gap-1">
                          <Globe className="size-2.5" />
                          {login.ip}
                        </span>
                      )}
                      {login.app && login.app !== "unknown" && (
                        <span className="text-[10px] text-muted-foreground/70">
                          {login.app === "admin" ? "Admin App" : "Website"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>

      {/* Security Tips */}
      <DashboardCard title="Security Tips">
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li className="flex items-start gap-2">
            <CheckCircle className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
            <span>
              Review your login history regularly. If you see any unfamiliar
              activity, change your password immediately.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
            <span>
              Use a strong, unique password that you don't use for other services.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
            <span>
              If failed login attempts appear that you didn't make, contact
              support for assistance.
            </span>
          </li>
        </ul>
      </DashboardCard>
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "success" | "warning";
}) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            "size-4",
            variant === "success" && "text-muted-foreground",
            variant === "warning" && "text-destructive",
            variant === "default" && "text-muted-foreground",
          )}
        />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "mt-1 text-lg font-semibold",
          variant === "warning" && value !== "0"
            ? "text-destructive"
            : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────

function SecurityOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <div className="border border-border bg-card p-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-1 h-3 w-56" />
        <div className="mt-3 space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
