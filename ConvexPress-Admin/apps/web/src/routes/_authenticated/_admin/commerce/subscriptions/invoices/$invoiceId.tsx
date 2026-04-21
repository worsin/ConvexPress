/**
 * Invoice detail.
 *
 * Backend: commerceSubscriptions.queries.getInvoice — returns the
 * invoice joined with `commerce_subscription_invoice_items`.
 *
 * Line items render in a simple table. Sidebar shows totals and
 * payment metadata. A link to the owning contract is included.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  CreditCard,
  ExternalLink,
  FileText,
  Hash,
  Receipt,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Doc, Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/invoices/$invoiceId",
)({
  component: InvoiceDetailPage,
});

type InvoiceStatus = "draft" | "open" | "paid" | "failed" | "void";

type InvoiceWithItems = Doc<"commerce_subscription_invoices"> & {
  items: Array<Doc<"commerce_subscription_invoice_items">>;
};

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
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
        "inline-flex rounded-full px-3 py-1 text-xs font-medium capitalize",
        styles[status],
      )}
    >
      {status}
    </span>
  );
}

function InvoiceDetailPage() {
  const { invoiceId } = Route.useParams();
  const data = useQuery(
    (api as any).commerceSubscriptions.queries.getInvoice,
    { invoiceId: invoiceId as Id<"commerce_subscription_invoices"> },
  ) as InvoiceWithItems | null | undefined;

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
          to="/commerce/subscriptions/invoices"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to invoices
        </Link>
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Invoice not found or plugin disabled.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/commerce/subscriptions/invoices"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to invoices
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
              <Receipt className="h-7 w-7 text-muted-foreground" />
              Invoice
            </h1>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Hash className="h-3 w-3" />
              <span className="font-mono">{String(data._id)}</span>
            </p>
          </div>
          <StatusBadge status={data.status as InvoiceStatus} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column — line items */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Line items
              </h2>
              <span className="text-xs text-muted-foreground">
                {data.items.length} line
                {data.items.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="grid grid-cols-[1.5fr_70px_110px_110px] gap-4 border-b border-border px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <div>Description</div>
              <div>Qty</div>
              <div>Unit</div>
              <div className="text-right">Total</div>
            </div>
            {data.items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No line items on this invoice.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.items.map((it) => (
                  <li
                    key={it._id}
                    className="grid grid-cols-[1.5fr_70px_110px_110px] items-center gap-4 px-5 py-3 text-sm"
                  >
                    <div className="min-w-0 text-foreground">
                      {it.description}
                    </div>
                    <div className="text-foreground">{it.quantity}</div>
                    <div className="font-mono text-xs text-foreground">
                      {formatMoney(
                        (it as any).unitAmount ?? 0,
                        data.currencyCode,
                      )}
                    </div>
                    <div className="text-right font-medium text-foreground">
                      {formatMoney(
                        (it as any).totalAmount ??
                          (it.quantity ?? 1) * ((it as any).unitAmount ?? 0),
                        data.currencyCode,
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-1 border-t border-border px-5 py-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-mono">
                  {formatMoney(data.subtotalAmount, data.currencyCode)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span className="font-mono">
                  {formatMoney(data.taxAmount, data.currencyCode)}
                </span>
              </div>
              <div className="flex justify-between pt-1 text-base font-semibold text-foreground">
                <span>Total</span>
                <span className="font-mono">
                  {formatMoney(data.totalAmount, data.currencyCode)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Details</h2>
            <SidebarRow
              label="Created"
              value={formatDateTime(data.createdAt)}
            />
            <SidebarRow label="Due" value={formatDateTime(data.dueAt)} />
            <SidebarRow label="Paid" value={formatDateTime(data.paidAt)} />
            <SidebarRow
              label="Currency"
              value={data.currencyCode}
              mono
            />
            <SidebarRow
              label="Manual billing"
              value={data.manualBilling ? "Yes" : "No"}
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              Payment
            </h2>
            <SidebarRow
              label="Provider"
              value={data.paymentProvider ?? "—"}
            />
            <SidebarRow
              label="Transaction id"
              value={data.paymentTransactionId ?? "—"}
              mono
            />
            <SidebarRow
              label="Saved method"
              value={data.savedPaymentMethodId ?? "—"}
              mono
            />
          </div>

          <Link
            to="/commerce/subscriptions/contracts/$contractId"
            params={{ contractId: String(data.subscriptionId) }}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            View contract
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </aside>
      </div>
    </div>
  );
}

function SidebarRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right text-foreground",
          mono && "font-mono",
        )}
      >
        {value}
      </span>
    </div>
  );
}
