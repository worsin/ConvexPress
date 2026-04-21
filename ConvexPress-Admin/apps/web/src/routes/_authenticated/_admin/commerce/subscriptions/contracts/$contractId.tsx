/**
 * Contract detail page.
 *
 * Layout: left column with tabs (Overview, Items, History, Entitlements,
 * Invoices) + right rail showing ContractActions (pause / resume /
 * cancel / coupon / offer-change).
 *
 * Backend: commerceSubscriptions.queries.getById returns the contract
 * with items, history, entitlements, and invoices pre-joined. We split
 * these into tabs here.
 */

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  CalendarClock,
  FileText,
  Hash,
  History,
  ListTree,
  Receipt,
  ShieldCheck,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Doc, Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { ContractActions } from "@/components/subscriptions/ContractActions";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/contracts/$contractId",
)({
  component: ContractDetailPage,
});

type ContractStatus =
  | "draft"
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "pending_cancel"
  | "cancelled"
  | "expired";

type TabKey = "overview" | "items" | "history" | "entitlements" | "invoices";

function formatMoney(amount: number | undefined, currencyCode = "USD") {
  if (typeof amount !== "number") return "--";
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

function formatDateTime(ts: number | undefined) {
  if (!ts) return "--";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: ContractStatus }) {
  const styles: Record<ContractStatus, string> = {
    active: "bg-primary/15 text-primary",
    trialing: "bg-accent/20 text-accent-foreground",
    paused: "bg-muted text-muted-foreground",
    past_due: "bg-destructive/10 text-destructive",
    pending_cancel: "bg-destructive/10 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
    expired: "bg-muted text-muted-foreground",
    draft: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        styles[status],
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ContractDetailPage() {
  const { contractId } = Route.useParams();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const data = useQuery(
    (api as any).commerceSubscriptions.queries.getById,
    { subscriptionId: contractId as Id<"commerce_subscriptions"> },
  ) as
    | (Doc<"commerce_subscriptions"> & {
        product?: { _id: string; title?: string; slug?: string } | null;
        template?: { _id: string; title?: string; slug?: string } | null;
        items: Array<Doc<"commerce_subscription_items">>;
        history: Array<Doc<"commerce_subscription_history">>;
        entitlements: Array<Doc<"commerce_subscription_entitlements">>;
        invoices: Array<Doc<"commerce_subscription_invoices">>;
      })
    | null
    | undefined;

  if (data === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="space-y-4">
        <Link
          to="/commerce/subscriptions/contracts"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to contracts
        </Link>
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Contract not found or plugin disabled.
          </p>
        </div>
      </div>
    );
  }

  const tabs: Array<{
    key: TabKey;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }> = [
    { key: "overview", label: "Overview", icon: FileText },
    { key: "items", label: "Items", icon: ListTree, count: data.items.length },
    {
      key: "history",
      label: "History",
      icon: History,
      count: data.history.length,
    },
    {
      key: "entitlements",
      label: "Entitlements",
      icon: ShieldCheck,
      count: data.entitlements.length,
    },
    {
      key: "invoices",
      label: "Invoices",
      icon: Receipt,
      count: data.invoices.length,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/commerce/subscriptions/contracts"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to contracts
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">
              {data.product?.title ?? "Subscription"}
            </h1>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Hash className="h-3 w-3" />
              <span className="font-mono">{String(data._id)}</span>
            </p>
          </div>
          <StatusBadge status={data.status as ContractStatus} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex flex-wrap gap-1 border-b border-border">
            {tabs.map(({ key, label, icon: Icon, count }) => {
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  {typeof count === "number" && (
                    <span
                      className={cn(
                        "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoCard
                  label="Recurring amount"
                  value={formatMoney(
                    (data as any).recurringAmount,
                    (data as any).currencyCode ?? "USD",
                  )}
                />
                <InfoCard
                  label="Billing interval"
                  value={
                    (data as any).billingIntervalCount
                      ? `Every ${(data as any).billingIntervalCount} ${(data as any).billingInterval ?? ""}${(data as any).billingIntervalCount !== 1 ? "s" : ""}`
                      : "—"
                  }
                />
                <InfoCard
                  label="Current period"
                  value={`${formatDate((data as any).currentPeriodStart)} → ${formatDate((data as any).currentPeriodEnd)}`}
                />
                <InfoCard
                  label="Next billing"
                  value={formatDate((data as any).nextBillingAt)}
                  icon={CalendarClock}
                />
                <InfoCard
                  label="Trial end"
                  value={formatDate((data as any).trialEndsAt)}
                />
                <InfoCard
                  label="Cancel at period end"
                  value={
                    (data as any).cancelAtPeriodEnd === true ? "Yes" : "No"
                  }
                />
                <InfoCard
                  label="Template"
                  value={data.template?.title ?? "—"}
                />
                <InfoCard
                  label="Created"
                  value={formatDateTime(data.createdAt)}
                />
              </div>
            </div>
          )}

          {activeTab === "items" && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="grid grid-cols-[1.5fr_80px_110px_110px_110px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <div>Title</div>
                <div>Qty</div>
                <div>Unit</div>
                <div>Status</div>
                <div>Cancel at end</div>
              </div>
              {data.items.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No items on this contract.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.items.map((it) => (
                    <li
                      key={it._id}
                      className="grid grid-cols-[1.5fr_80px_110px_110px_110px] items-center gap-4 px-5 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {it.titleSnapshot ?? "—"}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {it.entitlementCodes?.join(", ") || "—"}
                        </p>
                      </div>
                      <div className="text-foreground">{it.quantity}</div>
                      <div className="font-mono text-xs text-foreground">
                        {formatMoney(it.unitAmount, it.currencyCode)}
                      </div>
                      <div className="text-muted-foreground capitalize">
                        {it.status ?? "—"}
                      </div>
                      <div className="text-muted-foreground">
                        {it.cancelAtPeriodEnd ? "Yes" : "No"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="rounded-2xl border border-border bg-card shadow-sm">
              {data.history.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No events recorded yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.history.map((h) => (
                    <li key={h._id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                            {h.eventType}
                          </p>
                          <p className="mt-1 text-sm text-foreground">
                            {h.message}
                          </p>
                        </div>
                        <p className="shrink-0 text-xs text-muted-foreground">
                          {formatDateTime(h.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === "entitlements" && (
            <div className="rounded-2xl border border-border bg-card shadow-sm">
              {data.entitlements.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No entitlements granted yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.entitlements.map((ent) => (
                    <li
                      key={ent._id}
                      className="flex items-center justify-between px-5 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-medium text-foreground">
                          {ent.entitlementCode}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(ent.startsAt)} →{" "}
                          {formatDate(ent.endsAt)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                          ent.status === "active"
                            ? "bg-primary/15 text-primary"
                            : ent.status === "grace"
                              ? "bg-accent/20 text-accent-foreground"
                              : ent.status === "revoked"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground",
                        )}
                      >
                        {ent.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === "invoices" && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="grid grid-cols-[1fr_100px_120px_120px_32px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <div>Invoice</div>
                <div>Status</div>
                <div>Total</div>
                <div>Created</div>
                <div />
              </div>
              {data.invoices.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No invoices yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.invoices.map((inv) => (
                    <li key={inv._id}>
                      <Link
                        to="/commerce/subscriptions/invoices/$invoiceId"
                        params={{ invoiceId: inv._id }}
                        className="grid grid-cols-[1fr_100px_120px_120px_32px] items-center gap-4 px-5 py-3 text-sm transition-colors hover:bg-muted/30"
                      >
                        <div className="truncate font-mono text-xs text-foreground">
                          {String(inv._id)}
                        </div>
                        <div>
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                              inv.status === "paid"
                                ? "bg-primary/15 text-primary"
                                : inv.status === "failed"
                                  ? "bg-destructive/10 text-destructive"
                                  : inv.status === "void"
                                    ? "bg-muted text-muted-foreground"
                                    : "bg-accent/20 text-accent-foreground",
                            )}
                          >
                            {inv.status}
                          </span>
                        </div>
                        <div className="font-medium text-foreground">
                          {formatMoney(inv.totalAmount, inv.currencyCode)}
                        </div>
                        <div className="text-muted-foreground">
                          {formatDate(inv.createdAt)}
                        </div>
                        <ArrowLeft className="h-3 w-3 rotate-180 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Right rail */}
        <aside className="space-y-4">
          <ContractActions contract={data as unknown as Doc<"commerce_subscriptions">} />
        </aside>
      </div>
    </div>
  );
}

function InfoCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
