/**
 * Subscription Invoices list.
 *
 * Backend: commerceSubscriptions.queries.listInvoices.
 * Filter by invoice status. Search by invoice id or subscription id.
 */

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ChevronRight, Receipt, Search } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/invoices/",
)({
  component: InvoicesIndex,
});

type InvoiceStatus = "draft" | "open" | "paid" | "failed" | "void";

type Invoice = {
  _id: Id<"commerce_subscription_invoices">;
  subscriptionId: Id<"commerce_subscriptions">;
  status: InvoiceStatus;
  currencyCode: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentProvider?: string;
  dueAt?: number;
  paidAt?: number;
  createdAt: number;
  subscription?: {
    _id: string;
    status?: string;
  } | null;
};

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

function formatDate(ts?: number) {
  if (!ts) return "--";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const styles: Record<InvoiceStatus, string> = {
    paid: "bg-primary/15 text-primary",
    open: "bg-accent/20 text-accent-foreground",
    failed: "bg-destructive/10 text-destructive",
    void: "bg-muted text-muted-foreground",
    draft: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        styles[status],
      )}
    >
      {status}
    </span>
  );
}

function InvoicesIndex() {
  const [statusFilter, setStatusFilter] = useState<"" | InvoiceStatus>("");
  const [search, setSearch] = useState("");

  const invoices = useQuery(
    (api as any).commerceSubscriptions.queries.listInvoices,
    {
      status: statusFilter || undefined,
      limit: 200,
    },
  ) as Invoice[] | null | undefined;

  const pluginDisabled = invoices === null;

  const filtered = useMemo(() => {
    if (!invoices) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return invoices;
    return invoices.filter(
      (inv) =>
        String(inv._id).toLowerCase().includes(needle) ||
        String(inv.subscriptionId).toLowerCase().includes(needle),
    );
  }, [invoices, search]);

  const statuses: Array<"" | InvoiceStatus> = [
    "",
    "paid",
    "open",
    "failed",
    "void",
    "draft",
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Subscription invoices across all contracts. Click a row to
            see line items.
          </p>
        </div>
      </div>

      {pluginDisabled && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <Receipt className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            The commerce subscriptions plugin is disabled.
          </p>
        </div>
      )}

      {!pluginDisabled && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-1">
              {statuses.map((s) => (
                <button
                  key={s || "all"}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    statusFilter === s
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-foreground hover:bg-muted",
                  )}
                >
                  {s || "All"}
                </button>
              ))}
            </div>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by invoice or contract id…"
                className="w-full rounded-xl border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="grid grid-cols-[1fr_100px_130px_130px_130px_32px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <div>Invoice id</div>
              <div>Status</div>
              <div>Total</div>
              <div>Due</div>
              <div>Paid</div>
              <div />
            </div>

            {invoices === undefined ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-xl bg-muted"
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <Receipt className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {search || statusFilter
                    ? "No invoices match your filter."
                    : "No invoices yet."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((inv) => (
                  <li key={inv._id}>
                    <Link
                      to="/commerce/subscriptions/invoices/$invoiceId"
                      params={{ invoiceId: inv._id }}
                      className="grid grid-cols-[1fr_100px_130px_130px_130px_32px] items-center gap-4 px-5 py-4 text-sm transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-foreground">
                          {String(inv._id)}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                          contract: {String(inv.subscriptionId)}
                        </p>
                      </div>
                      <div>
                        <StatusBadge status={inv.status} />
                      </div>
                      <div className="font-medium text-foreground">
                        {formatMoney(inv.totalAmount, inv.currencyCode)}
                      </div>
                      <div className="text-muted-foreground">
                        {formatDate(inv.dueAt)}
                      </div>
                      <div className="text-muted-foreground">
                        {formatDate(inv.paidAt)}
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
