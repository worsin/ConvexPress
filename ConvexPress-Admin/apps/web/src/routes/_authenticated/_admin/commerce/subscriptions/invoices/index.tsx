/**
 * Subscription invoices: every charge a subscription has made or tried to
 * make, newest first, with the customer and any refunds. Filter by status.
 *
 * Data: `adminContracts.listInvoices` (paginated).
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex-helpers/react/cache";
import { ChevronRight, Receipt } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  formatDate,
  formatMoney,
  INVOICE_KIND_LABEL,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  invoiceStatusText,
  type InvoiceStatus,
} from "@/components/subscriptions/billingFormat";

export const Route = createFileRoute("/_authenticated/_admin/commerce/subscriptions/invoices/")({
  component: InvoicesIndex,
});

const FILTERS: ReadonlyArray<InvoiceStatus | undefined> = [undefined, "paid", "open", "failed", "void"];
const PAGE_SIZE = 25;
const COLUMNS = "grid-cols-[130px_minmax(0,1.3fr)_minmax(0,1fr)_120px_minmax(0,1.2fr)_20px]";

function InvoicesIndex() {
  const [status, setStatus] = useState<InvoiceStatus | undefined>(undefined);
  const list = usePaginatedQuery(api.commerceSubscriptions.adminContracts.listInvoices, { status }, { initialNumItems: PAGE_SIZE });
  const rows = list.status === "LoadingFirstPage" ? undefined : list.results;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every subscription charge: first payments, renewals and plan changes. Open one to see its lines, payment attempts and refunds.
        </p>
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
            {value ? INVOICE_STATUS_LABEL[value] : "All"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <div className="min-w-[820px]">
          <div className={cn("grid gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground", COLUMNS)}>
            <div>Invoice</div>
            <div>Customer</div>
            <div>For</div>
            <div>Amount</div>
            <div>Status</div>
            <div />
          </div>
          {rows === undefined ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center">
              <Receipt className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">{status ? `No ${INVOICE_STATUS_LABEL[status].toLowerCase()} invoices.` : "No invoices yet."}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <li key={row._id}>
                  <Link
                    to="/commerce/subscriptions/invoices/$invoiceId"
                    params={{ invoiceId: row._id }}
                    className={cn("grid items-center gap-4 px-5 py-3.5 text-sm transition-colors hover:bg-muted/30", COLUMNS)}
                  >
                    <div>
                      <p className="font-medium">{row.invoiceNumber ?? "Draft"}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(row.paidAt ?? row.createdAt)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate">{row.customerName ?? row.customerEmail ?? "Unknown customer"}</p>
                      {row.customerName && row.customerEmail ? <p className="truncate text-xs text-muted-foreground">{row.customerEmail}</p> : null}
                    </div>
                    <div className="min-w-0 text-xs text-muted-foreground">
                      <p>{INVOICE_KIND_LABEL[row.kind]}</p>
                      {row.periodStartAt !== undefined && row.periodEndAt !== undefined ? (
                        <p>
                          {formatDate(row.periodStartAt)} – {formatDate(row.periodEndAt)}
                        </p>
                      ) : null}
                    </div>
                    <div className="font-medium">{formatMoney(row.totalAmount, row.currencyCode)}</div>
                    <div>
                      <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", INVOICE_STATUS_TONE[row.status])}>
                        {invoiceStatusText(row)}
                      </span>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {list.status === "CanLoadMore" || list.status === "LoadingMore" ? (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={list.status === "LoadingMore"}
            onClick={() => list.loadMore(PAGE_SIZE)}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {list.status === "LoadingMore" ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
