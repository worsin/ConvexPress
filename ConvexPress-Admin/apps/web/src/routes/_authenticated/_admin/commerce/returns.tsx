import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  PackageCheck,
  DollarSign,
  CheckCircle2,
  Tag,
  FileText,
} from "lucide-react";
import { api } from "@backend/convex/_generated/api";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/returns",
)({
  component: CommerceReturnsPage,
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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
  refunded: "Refunded",
  completed: "Completed",
};

const STATUS_STYLES: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
  received: "bg-indigo-100 text-indigo-800",
  refunded: "bg-purple-100 text-purple-800",
  completed: "bg-emerald-100 text-emerald-800",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats Card                                                         */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Return Row                                                         */
/* ------------------------------------------------------------------ */

function ReturnRow({ ret }: { ret: any }) {
  const [expanded, setExpanded] = useState(false);
  const [actionModal, setActionModal] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("original_payment");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shippingLabelUrl, setShippingLabelUrl] = useState("");
  const [carrier, setCarrier] = useState("");
  const [busy, setBusy] = useState(false);

  const approveReturn = useMutation(
    (api as any).commerceReturns.mutations.approveReturn,
  );
  const rejectReturn = useMutation(
    (api as any).commerceReturns.mutations.rejectReturn,
  );
  const markReceived = useMutation(
    (api as any).commerceReturns.mutations.markReceived,
  );
  const processRefund = useMutation(
    (api as any).commerceReturns.mutations.processRefund,
  );
  const completeReturn = useMutation(
    (api as any).commerceReturns.mutations.completeReturn,
  );
  const addShippingLabel = useMutation(
    (api as any).commerceReturns.mutations.addShippingLabel,
  );
  const updateNotes = useMutation(
    (api as any).commerceReturns.mutations.updateNotes,
  );

  async function handleAction() {
    setBusy(true);
    try {
      if (actionModal === "approve") {
        const amount = Math.round(Number(refundAmount) * 100);
        if (amount <= 0) {
          toast.error("Refund amount must be greater than 0");
          setBusy(false);
          return;
        }
        await approveReturn({
          returnId: ret._id as any,
          refundAmount: amount,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        });
        toast.success("Return approved");
      } else if (actionModal === "reject") {
        if (!rejectReason.trim()) {
          toast.error("Please provide a reason for rejection");
          setBusy(false);
          return;
        }
        await rejectReturn({
          returnId: ret._id as any,
          reason: rejectReason.trim(),
        });
        toast.success("Return rejected");
      } else if (actionModal === "received") {
        await markReceived({
          returnId: ret._id as any,
          ...(trackingNumber.trim()
            ? { trackingNumber: trackingNumber.trim() }
            : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        });
        toast.success("Marked as received");
      } else if (actionModal === "refund") {
        await processRefund({
          returnId: ret._id as any,
          refundMethod,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        });
        toast.success("Refund processed");
      } else if (actionModal === "complete") {
        await completeReturn({
          returnId: ret._id as any,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        });
        toast.success("Return completed");
      } else if (actionModal === "label") {
        if (!shippingLabelUrl.trim()) {
          toast.error("Label URL is required");
          setBusy(false);
          return;
        }
        await addShippingLabel({
          returnId: ret._id as any,
          shippingLabelUrl: shippingLabelUrl.trim(),
          ...(trackingNumber.trim()
            ? { trackingNumber: trackingNumber.trim() }
            : {}),
          ...(carrier.trim() ? { carrier: carrier.trim() } : {}),
        });
        toast.success("Shipping label added");
      } else if (actionModal === "notes") {
        await updateNotes({
          returnId: ret._id as any,
          notes: notes.trim(),
        });
        toast.success("Notes updated");
      }
      setActionModal(null);
      resetForm();
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Action failed",
      );
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setRefundAmount("");
    setNotes("");
    setRejectReason("");
    setRefundMethod("original_payment");
    setTrackingNumber("");
    setShippingLabelUrl("");
    setCarrier("");
  }

  function openAction(action: string) {
    resetForm();
    setActionModal(action);
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      {/* Main row */}
      <div
        className="flex cursor-pointer items-center gap-4 px-5 py-4"
        onClick={() => setExpanded(!expanded)}
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
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Order: {ret.orderNumber ?? "N/A"}</span>
            <span>Customer: {ret.customerEmail ?? "Guest"}</span>
            <span>Reason: {ret.reason}</span>
            <span>{ret.items?.length ?? 0} item(s)</span>
          </div>
        </div>

        <div className="hidden text-right text-xs text-muted-foreground sm:block">
          {ret.refundAmount
            ? formatMoney(ret.refundAmount)
            : "No refund set"}
          <br />
          {formatDate(ret.createdAt)}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-5 py-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Return items */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Return Items
              </h4>
              <div className="mt-2 space-y-2">
                {(ret.items ?? []).map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  >
                    <p className="font-medium text-foreground">
                      Item: {String(item.orderItemId).slice(-8)}
                    </p>
                    <p className="text-muted-foreground">
                      Qty: {item.quantity}
                      {item.reason ? ` - ${item.reason}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Details */}
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Details
                </h4>
                <dl className="mt-2 space-y-2 text-sm">
                  {ret.reasonDetails && (
                    <div>
                      <dt className="text-muted-foreground">
                        Additional Details
                      </dt>
                      <dd className="font-medium text-foreground">
                        {ret.reasonDetails}
                      </dd>
                    </div>
                  )}
                  {ret.trackingNumber && (
                    <div>
                      <dt className="text-muted-foreground">
                        Tracking Number
                      </dt>
                      <dd className="font-medium text-foreground">
                        {ret.trackingNumber}
                      </dd>
                    </div>
                  )}
                  {ret.returnShippingLabel && (
                    <div>
                      <dt className="text-muted-foreground">
                        Shipping Label
                      </dt>
                      <dd>
                        <a
                          href={ret.returnShippingLabel}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          View Label
                        </a>
                      </dd>
                    </div>
                  )}
                  {ret.refundMethod && (
                    <div>
                      <dt className="text-muted-foreground">Refund Method</dt>
                      <dd className="font-medium text-foreground">
                        {ret.refundMethod}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {ret.notes && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Notes
                  </h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                    {ret.notes}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            {ret.status === "requested" && (
              <>
                <button
                  type="button"
                  onClick={() => openAction("approve")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => openAction("reject")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </button>
              </>
            )}
            {ret.status === "approved" && (
              <>
                <button
                  type="button"
                  onClick={() => openAction("received")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  <PackageCheck className="h-3.5 w-3.5" />
                  Mark Received
                </button>
                <button
                  type="button"
                  onClick={() => openAction("label")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <Tag className="h-3.5 w-3.5" />
                  Add Label
                </button>
              </>
            )}
            {ret.status === "received" && (
              <button
                type="button"
                onClick={() => openAction("refund")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700"
              >
                <DollarSign className="h-3.5 w-3.5" />
                Process Refund
              </button>
            )}
            {ret.status === "refunded" && (
              <button
                type="button"
                onClick={() => openAction("complete")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Complete Return
              </button>
            )}
            <button
              type="button"
              onClick={() => openAction("notes")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              <FileText className="h-3.5 w-3.5" />
              Edit Notes
            </button>
          </div>

          {/* Action form */}
          {actionModal && (
            <div className="mt-4 rounded-xl border border-border bg-background p-4">
              <h4 className="text-sm font-semibold text-foreground capitalize">
                {actionModal === "label"
                  ? "Add Shipping Label"
                  : actionModal === "notes"
                    ? "Update Notes"
                    : `${actionModal} Return`}
              </h4>
              <div className="mt-3 space-y-3">
                {actionModal === "approve" && (
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder="Refund amount (e.g. 29.99)"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                )}
                {actionModal === "reject" && (
                  <input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Rejection reason (required)"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                )}
                {actionModal === "received" && (
                  <input
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="Tracking number (optional)"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                )}
                {actionModal === "refund" && (
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  >
                    <option value="original_payment">
                      Original Payment Method
                    </option>
                    <option value="store_credit">Store Credit</option>
                    <option value="manual">Manual / Offline</option>
                  </select>
                )}
                {actionModal === "label" && (
                  <>
                    <input
                      value={shippingLabelUrl}
                      onChange={(e) => setShippingLabelUrl(e.target.value)}
                      placeholder="Label URL (required)"
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                    />
                    <input
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="Tracking number"
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                    />
                    <input
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      placeholder="Carrier (e.g. UPS, FedEx)"
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                    />
                  </>
                )}
                {(actionModal === "approve" ||
                  actionModal === "received" ||
                  actionModal === "refund" ||
                  actionModal === "complete" ||
                  actionModal === "notes") && (
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      actionModal === "notes"
                        ? "Enter notes..."
                        : "Optional notes"
                    }
                    rows={3}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAction()}
                    disabled={busy}
                    className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {busy ? "Processing..." : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionModal(null);
                      resetForm();
                    }}
                    className="inline-flex rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

const STATUS_FILTERS = [
  "all",
  "requested",
  "approved",
  "rejected",
  "received",
  "refunded",
  "completed",
] as const;

function CommerceReturnsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const stats = useQuery(
    (api as any).commerceReturns.queries.getStats,
    {},
  ) as any;

  const returns = useQuery(
    (api as any).commerceReturns.queries.list,
    statusFilter === "all"
      ? { limit: 50 }
      : { status: statusFilter, limit: 50 },
  ) as any;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Returns</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage return requests, process refunds, and track returned
          merchandise.
        </p>
      </div>

      {/* Stats */}
      {stats === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
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

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s === "all" ? "All" : STATUS_LABELS[s] ?? s}
            {s !== "all" && stats?.byStatus
              ? ` (${stats.byStatus[s] ?? 0})`
              : ""}
          </button>
        ))}
      </div>

      {/* Returns list */}
      {returns === undefined ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-muted"
            />
          ))}
        </div>
      ) : returns?.returns?.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <RotateCcw className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            {statusFilter === "all"
              ? "No return requests yet."
              : `No ${STATUS_LABELS[statusFilter]?.toLowerCase() ?? statusFilter} returns.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {(returns?.returns ?? []).map((ret: any) => (
            <ReturnRow key={ret._id} ret={ret} />
          ))}
          {returns?.hasMore && (
            <p className="text-center text-xs text-muted-foreground">
              Showing first {returns.returns.length} results. More returns
              exist.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
