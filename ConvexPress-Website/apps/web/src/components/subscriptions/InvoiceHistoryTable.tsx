import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { cn } from "@/lib/utils";

/**
 * Renders the current user's subscription invoice history across all their
 * contracts. Uses `portal.listMyInvoices` so no fan-out queries are needed.
 *
 * The "Download" button calls `portal.getInvoicePdf` (an action) and
 * triggers a file download using a client-side Blob. Real PDF rendering is
 * a Wave 7 concern — today we ship the text placeholder the backend returns.
 *
 * Theme-token colours only.
 */

type Invoice = {
  _id: string;
  status: string;
  totalAmount: number;
  currencyCode: string;
  dueAt?: number;
  paidAt?: number;
  createdAt: number;
  subscription?: {
    _id: string;
    status: string;
  } | null;
};

interface InvoiceHistoryTableProps {
  /**
   * Optional filter: limit the list to invoices belonging to ONE specific
   * contract. When omitted the table shows invoices across all the user's
   * contracts — the default for the portal overview page.
   */
  contractId?: string;
  /** Max invoices to show. Defaults to 100. */
  limit?: number;
  className?: string;
}

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

// ─── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "paid"
      ? "bg-primary/10 text-primary"
      : status === "failed"
        ? "bg-destructive/10 text-destructive"
        : status === "refunded"
          ? "bg-accent text-accent-foreground"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
        tone,
      )}
    >
      {status}
    </span>
  );
}

// ─── Download helper ────────────────────────────────────────────────────────

function downloadTextFile(filename: string, content: string) {
  // SSR safety: only run in the browser. The table is interactive and won't
  // reach this code until after hydration, but belt-and-braces.
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so Safari has time to pick up the download.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function InvoiceHistoryTable({
  contractId,
  limit = 100,
  className,
}: InvoiceHistoryTableProps) {
  const invoices = useQuery(
    (api as any).commerceSubscriptions.portal.listMyInvoices,
    { limit },
  ) as Invoice[] | undefined;

  const getInvoicePdf = useAction(
    (api as any).commerceSubscriptions.portal.getInvoicePdf,
  );

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const rows = (invoices ?? []).filter((invoice) => {
    if (!contractId) return true;
    return invoice.subscription?._id === contractId;
  });

  async function handleDownload(invoiceId: string) {
    setDownloadingId(invoiceId);
    try {
      const result = await getInvoicePdf({ invoiceId: invoiceId as any });
      downloadTextFile(result.filename, result.content);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Could not download invoice",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  if (invoices === undefined) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-border bg-card shadow-sm",
          className,
        )}
      >
        <div className="h-12 animate-pulse" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center",
          className,
        )}
      >
        <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-2 text-xs text-muted-foreground">
          No invoices yet.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card shadow-sm",
        className,
      )}
      data-slot="invoice-history-table"
    >
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Invoices
        </h3>
      </div>

      <div className="divide-y divide-border">
        {rows.map((invoice) => (
          <div
            key={invoice._id}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">
                {formatDate(invoice.createdAt)}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {invoice._id}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-foreground">
                {formatMoney(invoice.totalAmount, invoice.currencyCode)}
              </span>
              <StatusBadge status={invoice.status} />
              <button
                type="button"
                onClick={() => handleDownload(invoice._id)}
                disabled={downloadingId === invoice._id}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                aria-label={`Download invoice ${invoice._id}`}
              >
                <Download className="h-3 w-3" />
                {downloadingId === invoice._id ? "…" : "Download"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
