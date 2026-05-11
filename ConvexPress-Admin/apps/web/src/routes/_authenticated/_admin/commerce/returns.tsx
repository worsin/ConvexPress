import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache";
import {
  ChevronDown,
  ChevronRight,
  DollarSign,
  FileText,
  PackageCheck,
  RotateCcw,
} from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { usePluginSettings } from "@/hooks/usePluginSettings";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/returns",
)({
  component: CommerceReturnsPage,
});

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

function formatDate(ts: number | undefined) {
  if (!ts) return "--";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  received: "Received",
  refund_pending: "Refund Pending",
  refunded: "Refunded",
  completed: "Completed",
};

const STATUS_STYLES: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
  received: "bg-indigo-100 text-indigo-800",
  refund_pending: "bg-orange-100 text-orange-800",
  refunded: "bg-purple-100 text-purple-800",
  completed: "bg-emerald-100 text-emerald-800",
};

const NEXT_STEP_COPY: Record<string, string> = {
  requested: "Review item-level quantities and approve or reject on the detail page.",
  approved: "Capture received quantities and condition codes on the detail page.",
  received: "Choose the refund method and submit the refund workflow on the detail page.",
  refund_pending: "Monitor the provider refund result before completing the return.",
  refunded: "Complete the return to finalize disposition-based restocking.",
  rejected: "No action required unless support needs to reopen the case manually.",
  completed: "Return is closed. Use the detail page for audit history.",
};

const STATUS_FILTERS = [
  "all",
  "requested",
  "approved",
  "rejected",
  "received",
  "refund_pending",
  "refunded",
  "completed",
] as const;

function formatReasonLabel(reason: string) {
  return reason.replace(/_/g, " ");
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function getAgingLabel(createdAt: number | undefined) {
  if (!createdAt) return null;
  const ageDays = Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000));
  if (ageDays >= 14) {
    return { label: `${ageDays}d old`, className: "bg-red-100 text-red-800" };
  }
  if (ageDays >= 7) {
    return {
      label: `${ageDays}d old`,
      className: "bg-amber-100 text-amber-800",
    };
  }
  return null;
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2.5 ${tone ?? "bg-muted"}`}>
          <Icon className="h-5 w-5 text-inherit" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ReturnRow({ ret }: { ret: any }) {
  const [expanded, setExpanded] = useState(false);
  const returnItems = ret.returnItems ?? ret.items ?? [];
  const history = ret.history ?? [];
  const nextStep =
    NEXT_STEP_COPY[ret.status] ?? "Open the detail page for the current workflow.";
  const aging = getAgingLabel(ret.createdAt);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div
        className="flex cursor-pointer items-center gap-4 px-5 py-4"
        onClick={() => setExpanded((current) => !current)}
      >
        <button type="button" className="shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-foreground">
              {ret.returnNumber}
            </span>
            <StatusBadge status={ret.status} />
            {aging ? (
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${aging.className}`}
              >
                {aging.label}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Order: {ret.orderNumber ?? "N/A"}</span>
            <span>Customer: {ret.customerEmail ?? "Guest"}</span>
            <span>Reason: {formatReasonLabel(String(ret.reason ?? ""))}</span>
            <span>{ret.itemCount ?? returnItems.length ?? 0} item(s)</span>
          </div>
        </div>

        <div className="hidden text-right text-xs text-muted-foreground sm:block">
          {ret.refundAmount ? formatMoney(ret.refundAmount) : "No refund set"}
          <br />
          {formatDate(ret.createdAt)}
        </div>

        <Link
          to={"/commerce/returns/$returnId" as any}
          params={{ returnId: ret._id } as any}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex h-8 items-center justify-center rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium text-foreground transition-colors hover:bg-input/50"
        >
          Open workflow
        </Link>
      </div>

      {expanded ? (
        <div className="border-t border-border px-5 py-4">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-background px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Next Step
                </p>
                <p className="mt-2 text-sm text-foreground">{nextStep}</p>
                {ret.refundFailureReason ? (
                  <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    Refund failure: {ret.refundFailureReason}
                  </p>
                ) : null}
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Return Items
                </h4>
                <div className="mt-2 space-y-2">
                  {returnItems.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-border bg-background px-4 py-3 text-sm"
                    >
                      <p className="font-medium text-foreground">
                        {item.orderItem?.productTitle ?? `Item ${String(item.orderItemId).slice(-8)}`}
                      </p>
                      <p className="text-muted-foreground">
                        Requested: {item.quantityRequested ?? item.quantity ?? 0}
                        {item.quantityApproved !== undefined
                          ? ` | Approved: ${item.quantityApproved}`
                          : ""}
                        {item.quantityReceived !== undefined
                          ? ` | Received: ${item.quantityReceived}`
                          : ""}
                        {item.quantityRestocked !== undefined
                          ? ` | Restocked: ${item.quantityRestocked}`
                          : ""}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {item.reason ? <span>Reason: {item.reason}</span> : null}
                        {item.conditionCode ? (
                          <span>
                            Condition: {formatReasonLabel(String(item.conditionCode))}
                          </span>
                        ) : null}
                        {item.resolutionType ? (
                          <span>
                            Resolution: {formatReasonLabel(String(item.resolutionType))}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Summary
                </h4>
                <dl className="mt-2 space-y-2 text-sm">
                  {ret.reasonDetails ? (
                    <div>
                      <dt className="text-muted-foreground">Additional Details</dt>
                      <dd className="font-medium text-foreground">
                        {ret.reasonDetails}
                      </dd>
                    </div>
                  ) : null}
                  {ret.trackingNumber ? (
                    <div>
                      <dt className="text-muted-foreground">Tracking Number</dt>
                      <dd className="font-medium text-foreground">
                        {ret.trackingNumber}
                      </dd>
                    </div>
                  ) : null}
                  {ret.refundMethod ? (
                    <div>
                      <dt className="text-muted-foreground">Refund Method</dt>
                      <dd className="font-medium text-foreground">
                        {String(ret.refundMethod).replace(/_/g, " ")}
                      </dd>
                    </div>
                  ) : null}
                  {ret.returnShippingLabel ? (
                    <div>
                      <dt className="text-muted-foreground">Shipping Label</dt>
                      <dd>
                        <a
                          href={ret.returnShippingLabel}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-primary hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          View label
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              {ret.notes ? (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Notes
                  </h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                    {ret.notes}
                  </p>
                </div>
              ) : null}

              {history.length > 0 ? (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Recent History
                  </h4>
                  <div className="mt-2 space-y-2">
                    {history.slice(-3).reverse().map((entry: any) => (
                      <div
                        key={entry._id}
                        className="rounded-xl border border-border bg-background px-4 py-3 text-sm"
                      >
                        <p className="font-medium text-foreground">
                          {String(entry.eventType).replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(entry.createdAt)}
                          {entry.fromStatus || entry.toStatus
                            ? ` | ${entry.fromStatus ?? "--"} -> ${entry.toStatus ?? "--"}`
                            : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CommerceReturnsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const { isEnabled } = usePluginSettings();
  const returnsEnabled = isEnabled("commerceReturns");

  const stats = useQuery(
    (api as any).commerceReturns.queries.getStats,
    returnsEnabled ? {} : "skip",
  ) as any;

  const returns = usePaginatedQuery(
    (api as any).commerceReturns.queries.list,
    !returnsEnabled
      ? "skip"
      : statusFilter === "all"
        ? {}
        : { status: statusFilter },
    { initialNumItems: 50 },
  ) as any;
  const filteredReturns = (returns.results ?? []).filter((ret: any) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return [
      ret.returnNumber,
      ret.orderNumber,
      ret.customerEmail,
      ret.reason,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  return (
    <PluginGuard pluginId="commerceReturns">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Returns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review the queue, then open each return detail page for item-level
            approval, receipt, refund, and completion.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to={"/commerce/returns/settings" as any}
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Return Settings
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm">
          Header-level queue actions have been removed. All return-changing
          operations now run through the detail workflow so approved and received
          quantities, condition codes, and disposition are captured per item.
        </div>

        <div className="max-w-md">
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by return number, order, customer, or reason"
          />
        </div>

        {stats === undefined ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : stats ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total Returns"
              value={stats.total}
              icon={RotateCcw}
              tone="bg-blue-100 text-blue-700"
            />
            <StatCard
              label="Pending Action"
              value={stats.pendingAction}
              icon={PackageCheck}
              tone="bg-amber-100 text-amber-700"
            />
            <StatCard
              label="Recent (30d)"
              value={stats.recentCount}
              icon={FileText}
              tone="bg-indigo-100 text-indigo-700"
            />
            <StatCard
              label="Total Refunded"
              value={formatMoney(stats.totalRefunded)}
              icon={DollarSign}
              tone="bg-emerald-100 text-emerald-700"
            />
          </div>
        ) : null}

        {stats?.topReasons?.length ? (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">
              Top Return Reasons
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Counted from normalized return item rows, with legacy embedded
              items included when not yet migrated.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {stats.topReasons.map((entry: any) => (
                <div
                  key={entry.reason}
                  className="rounded-xl border border-border bg-background px-4 py-3"
                >
                  <p className="text-sm font-medium capitalize text-foreground">
                    {formatReasonLabel(entry.reason)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.count} item(s)
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === status
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {status === "all" ? "All" : STATUS_LABELS[status] ?? status}
              {status !== "all" && stats?.byStatus
                ? ` (${stats.byStatus[status] ?? 0})`
                : ""}
            </button>
          ))}
        </div>

        {returns.status === "LoadingFirstPage" ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : returns.results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <RotateCcw className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              {statusFilter === "all"
                ? "No return requests yet."
                : `No ${STATUS_LABELS[statusFilter]?.toLowerCase() ?? statusFilter} returns.`}
            </p>
          </div>
        ) : filteredReturns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No returns match the current search.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReturns.map((ret: any) => (
              <ReturnRow key={ret._id} ret={ret} />
            ))}
            {returns.status === "CanLoadMore" ||
            returns.status === "LoadingMore" ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => returns.loadMore(50)}
                  disabled={returns.status === "LoadingMore"}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {returns.status === "LoadingMore"
                    ? "Loading more..."
                    : "Load more returns"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </PluginGuard>
  );
}
