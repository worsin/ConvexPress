/**
 * IntegrationHeader — shared top-of-page header for every integration
 * detail page (Stripe, PayPal, Clerk, GA4, USPS, etc). Renders the
 * provider name + status badge + last-verified timestamp + slot for a
 * test button.
 */

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";

export type IntegrationStatus =
  | "connected"
  | "degraded"
  | "error"
  | "not_configured";

const STATUS_CLASSES: Record<IntegrationStatus, string> = {
  connected: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  degraded: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  error: "bg-destructive/10 text-destructive",
  not_configured: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<IntegrationStatus, string> = {
  connected: "Connected",
  degraded: "Degraded",
  error: "Error",
  not_configured: "Not configured",
};

export interface IntegrationHeaderProps {
  name: string;
  description?: string;
  status: IntegrationStatus;
  lastVerifiedAt?: number | null;
  icon?: ReactNode;
  actions?: ReactNode;
}

function formatRelative(ts: number | null | undefined) {
  if (!ts) return null;
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function IntegrationHeader({
  name,
  description,
  status,
  lastVerifiedAt,
  icon,
  actions,
}: IntegrationHeaderProps) {
  return (
    <div className="space-y-4">
      <Link
        to="/settings/integrations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All integrations
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {icon && (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card">
              {icon}
            </div>
          )}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {name}
              </h1>
              <Badge className={STATUS_CLASSES[status]}>
                {STATUS_LABELS[status]}
              </Badge>
            </div>
            {description && (
              <p className="max-w-2xl text-sm text-muted-foreground">
                {description}
              </p>
            )}
            {lastVerifiedAt && (
              <p className="text-xs text-muted-foreground">
                Last verified {formatRelative(lastVerifiedAt)}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </div>
  );
}
