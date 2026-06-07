import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { ChevronRight, ExternalLink, ShieldAlert } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/dunning",
)({
  component: DunningQueuePage,
});

type Invoice = {
  _id: Id<"commerce_subscription_invoices">;
  status: "draft" | "open" | "paid" | "failed" | "void";
  currencyCode: string;
  totalAmount: number;
  paymentProvider?: string;
  dueAt?: number;
  updatedAt: number;
};

type DunningAttemptStatus =
  | "scheduled"
  | "processing"
  | "failed"
  | "succeeded"
  | "aborted";

type DunningScope =
  | "all"
  | "scheduled"
  | "processing"
  | "failed"
  | "resolved";

type DunningAttempt = {
  _id: Id<"commerce_subscription_dunning_attempts">;
  subscriptionId: Id<"commerce_subscriptions">;
  invoiceId?: Id<"commerce_subscription_invoices">;
  attemptNumber: number;
  status: DunningAttemptStatus;
  scheduledAt: number;
  processedAt?: number;
  errorMessage?: string;
  updatedAt: number;
  subscription?: {
    _id: Id<"commerce_subscriptions">;
    status?: string;
    customer?: {
      email?: string;
      firstName?: string;
      lastName?: string;
    } | null;
  } | null;
  invoice?: Invoice | null;
};

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

function formatCustomer(attempt: DunningAttempt) {
  const customer = attempt.subscription?.customer;
  if (!customer) return "Unknown customer";
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
  return name || customer.email || "Unknown customer";
}

function formatDateTime(ts?: number) {
  if (!ts) return "--";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatStatus(status: DunningAttemptStatus) {
  return status.replace(/_/g, " ");
}

function statusClassName(status: DunningAttemptStatus) {
  switch (status) {
    case "processing":
      return "bg-accent/20 text-accent-foreground";
    case "scheduled":
      return "bg-primary/10 text-primary";
    case "failed":
      return "bg-destructive/10 text-destructive";
    case "succeeded":
      return "bg-success/10 text-success";
    case "aborted":
      return "bg-muted text-muted-foreground";
  }
}

function DunningQueuePage() {
  const [scope, setScope] = useState<DunningScope>("all");
  const now = Date.now();

  const attempts = useQuery(
    (api as any).commerceSubscriptions.queries.listDunningAttempts,
    { limit: 200 },
  ) as DunningAttempt[] | null | undefined;

  const pluginDisabled = attempts === null;
  const rows = attempts ?? [];
  const filteredRows = rows.filter((attempt) => {
    if (scope === "all") return true;
    if (scope === "resolved") {
      return attempt.status === "succeeded" || attempt.status === "aborted";
    }
    return attempt.status === scope;
  });
  const dueNowCount = rows.filter(
    (attempt) => attempt.status === "scheduled" && attempt.scheduledAt <= now,
  ).length;
  const scheduledCount = rows.filter(
    (attempt) => attempt.status === "scheduled",
  ).length;
  const failedCount = rows.filter((attempt) => attempt.status === "failed").length;
  const resolvedCount = rows.filter(
    (attempt) => attempt.status === "succeeded" || attempt.status === "aborted",
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <ShieldAlert className="h-7 w-7 text-muted-foreground" />
            Dunning queue
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Subscription payment retry attempts recorded by the billing sweep.
            Each attempt is tied to its contract and invoice so failed payment
            recovery can be audited without inferring state from invoice status.
          </p>
        </div>
      </div>

      {pluginDisabled && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            The commerce subscriptions plugin is disabled.
          </p>
        </div>
      )}

      {!pluginDisabled && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: "Due now", value: dueNowCount },
              { label: "Scheduled", value: scheduledCount },
              { label: "Failed", value: failedCount },
              { label: "Resolved", value: resolvedCount },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {metric.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { key: "all", label: "All" },
                { key: "scheduled", label: "Scheduled" },
                { key: "processing", label: "Processing" },
                { key: "failed", label: "Failed" },
                { key: "resolved", label: "Resolved" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setScope(key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  scope === key
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="grid min-w-[980px] grid-cols-[110px_120px_1fr_160px_130px_160px_160px_32px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <div>Attempt</div>
              <div>Status</div>
              <div>Contract</div>
              <div>Amount</div>
              <div>Provider</div>
              <div>Scheduled</div>
              <div>Updated</div>
              <div />
            </div>

            {attempts === undefined ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-xl bg-muted"
                  />
                ))}
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="p-10 text-center">
                <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  No dunning attempts match this view.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredRows.map((attempt) => (
                  <li
                    key={attempt._id}
                    className="grid min-w-[980px] grid-cols-[110px_120px_1fr_160px_130px_160px_160px_32px] items-center gap-4 px-5 py-4 text-sm"
                  >
                    <div className="font-mono text-xs text-foreground">
                      #{attempt.attemptNumber}
                    </div>
                    <div>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-1 text-[11px] font-medium capitalize",
                          statusClassName(attempt.status),
                        )}
                      >
                        {formatStatus(attempt.status)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <Link
                        to="/commerce/subscriptions/contracts/$contractId"
                        params={{ contractId: attempt.subscriptionId }}
                        className="block truncate font-medium text-foreground hover:text-primary"
                      >
                        {formatCustomer(attempt)}
                      </Link>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                        <span className="font-mono">
                          {String(attempt.subscriptionId)}
                        </span>
                        {attempt.subscription?.status && (
                          <span className="inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                            {attempt.subscription.status.replace(/_/g, " ")}
                          </span>
                        )}
                      </p>
                      {attempt.errorMessage && (
                        <p className="mt-1 truncate text-[11px] text-destructive">
                          {attempt.errorMessage}
                        </p>
                      )}
                    </div>
                    <div className="font-medium text-foreground">
                      {attempt.invoice
                        ? formatMoney(
                            attempt.invoice.totalAmount,
                            attempt.invoice.currencyCode,
                          )
                        : "--"}
                    </div>
                    <div className="text-muted-foreground">
                      {attempt.invoice?.paymentProvider ?? "--"}
                    </div>
                    <div className="text-muted-foreground">
                      {formatDateTime(attempt.scheduledAt)}
                    </div>
                    <div className="text-muted-foreground">
                      {formatDateTime(attempt.updatedAt)}
                    </div>
                    <div>
                      {attempt.invoiceId ? (
                        <Link
                          to="/commerce/subscriptions/invoices/$invoiceId"
                          params={{ invoiceId: attempt.invoiceId }}
                          className="inline-flex rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label="Open invoice"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end">
            <Link
              to="/commerce/subscriptions/invoices"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              View all invoices
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
