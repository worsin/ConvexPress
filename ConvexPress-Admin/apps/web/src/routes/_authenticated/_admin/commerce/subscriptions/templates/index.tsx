/**
 * Subscription templates: the billing behind offers (cadence, trial, grace,
 * pause, failed-payment retries), with the offers and customers on each.
 *
 * Data: `adminCatalog.listTemplateRows`.
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { CalendarClock, ChevronRight, Plus } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { formatCadence } from "@/components/subscriptions/billingFormat";

export const Route = createFileRoute("/_authenticated/_admin/commerce/subscriptions/templates/")({
  component: TemplatesIndex,
});

type TemplateStatus = "draft" | "active" | "archived";
const FILTERS: ReadonlyArray<TemplateStatus | undefined> = [undefined, "active", "draft", "archived"];
const LABEL: Record<TemplateStatus, string> = { active: "Active", draft: "Draft", archived: "Archived" };
const TONE: Record<TemplateStatus, string> = {
  active: "bg-primary/15 text-primary",
  draft: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};
const COLUMNS = "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_90px_90px_100px_20px]";

function retrySummary(days: number[], cancel: boolean): string {
  if (days.length === 0) return cancel ? "No retries, then cancel" : "No retries";
  return `Retry after ${days.join(", ")} day${days.length === 1 && days[0] === 1 ? "" : "s"}${cancel ? ", then cancel" : ""}`;
}

function TemplatesIndex() {
  const [status, setStatus] = useState<TemplateStatus | undefined>(undefined);
  const templates = useQuery(api.commerceSubscriptions.adminCatalog.listTemplateRows, { status });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">How offers bill: cadence, trial, grace, pausing, and the retry schedule when a renewal payment fails.</p>
        </div>
        <Link
          to="/commerce/subscriptions/templates/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New template
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Status">
        {FILTERS.map((value) => (
          <button
            key={value ?? "all"}
            type="button"
            role="tab"
            aria-selected={status === value}
            onClick={() => setStatus(value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              status === value ? "bg-primary text-primary-foreground" : "border border-border text-foreground hover:bg-muted",
            )}
          >
            {value ? LABEL[value] : "All"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <div className="min-w-[880px]">
          <div className={cn("grid gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground", COLUMNS)}>
            <div>Template</div>
            <div>Billing</div>
            <div>Failed payments</div>
            <div>Offers</div>
            <div>Customers</div>
            <div>Status</div>
            <div />
          </div>
          {templates === undefined ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="p-10 text-center">
              <CalendarClock className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">{status ? "No templates here." : "No templates yet. Create one to set how offers bill."}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {templates.map((template) => (
                <li key={template._id}>
                  <Link
                    to="/commerce/subscriptions/templates/$templateId/edit"
                    params={{ templateId: template._id }}
                    className={cn("grid items-center gap-4 px-5 py-3.5 text-sm transition-colors hover:bg-muted/30", COLUMNS)}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{template.title}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {template.slug} · v{template.version}
                      </p>
                    </div>
                    <div className="text-xs">
                      <p className="text-foreground">Billed {formatCadence(template.billingInterval, template.billingIntervalCount)}</p>
                      <p className="text-muted-foreground">
                        {template.trialDays ? `${template.trialDays}-day trial` : "No trial"}
                        {template.pausable ? " · pausable" : ""}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <p>{retrySummary(template.retryPolicy.retryDays, template.retryPolicy.cancelAfterFinalFailure)}</p>
                      <p>{template.gracePeriodDays}-day grace</p>
                    </div>
                    <div className="text-xs">{template.offerCount}</div>
                    <div className="text-xs">
                      <span className="font-medium">{template.usage.liveContracts}</span>
                      <span className="text-muted-foreground"> live</span>
                    </div>
                    <div>
                      <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[template.status])}>{LABEL[template.status]}</span>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
