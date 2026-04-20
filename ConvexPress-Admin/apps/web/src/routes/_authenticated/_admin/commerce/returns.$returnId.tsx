import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@backend/convex/_generated/api";

import { PluginGuard } from "@/components/plugins/PluginGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/returns/$returnId",
)({
  component: CommerceReturnDetailRoute,
});

function CommerceReturnDetailRoute() {
  return (
    <PluginGuard pluginId="commerceReturns">
      <CommerceReturnDetailPage />
    </PluginGuard>
  );
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

const APPROVAL_RESOLUTION_OPTIONS = [
  { value: "refund", label: "Refund" },
  { value: "exchange", label: "Exchange" },
  { value: "store_credit", label: "Store Credit" },
  { value: "manual_review", label: "Manual Review" },
];

const RECEIPT_CONDITION_OPTIONS = [
  { value: "new", label: "New" },
  { value: "opened", label: "Opened" },
  { value: "used", label: "Used" },
  { value: "damaged", label: "Damaged" },
  { value: "defective", label: "Defective" },
];

const RECEIPT_RESOLUTION_OPTIONS = [
  { value: "restock", label: "Restock" },
  { value: "quarantine", label: "Quarantine" },
  { value: "dispose", label: "Dispose" },
  { value: "return_to_vendor", label: "Return to Vendor" },
];

const REFUND_METHOD_OPTIONS = [
  { value: "original_payment", label: "Original Payment" },
  { value: "manual", label: "Manual" },
  { value: "store_credit", label: "Store Credit" },
];

type EditableApprovalItem = {
  orderItemId: string;
  quantityApproved: string;
  resolutionType: string;
};

type EditableReceiptItem = {
  orderItemId: string;
  quantityReceived: string;
  conditionCode: string;
  resolutionType: string;
};

function formatDate(ts: number | undefined) {
  if (!ts) return "--";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

function buildApprovalDraft(items: any[] = []): EditableApprovalItem[] {
  return items.map((item) => ({
    orderItemId: String(item.orderItemId),
    quantityApproved: String(item.quantityApproved ?? item.quantityRequested ?? 0),
    resolutionType: item.resolutionType ?? "refund",
  }));
}

function buildReceiptDraft(items: any[] = []): EditableReceiptItem[] {
  return items.map((item) => ({
    orderItemId: String(item.orderItemId),
    quantityReceived: String(item.quantityReceived ?? item.quantityApproved ?? 0),
    conditionCode: item.conditionCode ?? "new",
    resolutionType: item.resolutionType ?? "restock",
  }));
}

function calculateApprovalRefundLimitCents(
  approvalItems: EditableApprovalItem[],
  orderItems: any[] = [],
) {
  const orderItemsById = new Map<string, any>(
    orderItems.map((item: any) => [String(item.orderItemId), item.orderItem]),
  );

  return approvalItems.reduce((sum, item) => {
    const orderItem = orderItemsById.get(item.orderItemId);
    const orderedQuantity = Math.max(0, orderItem?.quantity ?? 0);
    const approvedQuantity = Math.max(
      0,
      Number.parseInt(item.quantityApproved, 10) || 0,
    );
    if (!orderItem || orderedQuantity <= 0 || approvedQuantity <= 0) {
      return sum;
    }

    const lineTotal =
      typeof orderItem.lineTotalAmount === "number"
        ? orderItem.lineTotalAmount
        : Math.max(0, orderItem.unitPriceAmount ?? 0) * orderedQuantity;
    return sum + Math.round((lineTotal * approvedQuantity) / orderedQuantity);
  }, 0);
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

function CommerceReturnDetailPage() {
  const { returnId } = Route.useParams();
  const ret = useQuery((api as any).commerceReturns.queries.getWithDetails, {
    returnId: returnId as any,
  }) as any;

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
  const retryStuckRefund = useMutation(
    (api as any).commerceReturns.mutations.retryStuckRefund,
  );

  const [approvalRefundAmount, setApprovalRefundAmount] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [approvalItems, setApprovalItems] = useState<EditableApprovalItem[]>([]);
  const [rejectReason, setRejectReason] = useState("");
  const [receiptTrackingNumber, setReceiptTrackingNumber] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");
  const [receiptItems, setReceiptItems] = useState<EditableReceiptItem[]>([]);
  const [refundMethod, setRefundMethod] = useState("original_payment");
  const [refundNotes, setRefundNotes] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [labelUrl, setLabelUrl] = useState("");
  const [labelCarrier, setLabelCarrier] = useState("");
  const [labelTrackingNumber, setLabelTrackingNumber] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const approvalRefundLimit = calculateApprovalRefundLimitCents(
    approvalItems,
    ret?.orderItems ?? [],
  );

  useEffect(() => {
    if (!ret) return;
    setApprovalRefundAmount(
      ret.refundAmount ? String((ret.refundAmount / 100).toFixed(2)) : "",
    );
    setApprovalNotes("");
    setApprovalItems(buildApprovalDraft(ret.orderItems));
    setRejectReason("");
    setReceiptTrackingNumber(ret.trackingNumber ?? "");
    setReceiptNotes("");
    setReceiptItems(buildReceiptDraft(ret.orderItems));
    setRefundMethod(ret.refundMethod ?? "original_payment");
    setRefundNotes("");
    setCompletionNotes("");
    setLabelUrl(ret.returnShippingLabel ?? "");
    setLabelCarrier("");
    setLabelTrackingNumber(ret.trackingNumber ?? "");
    setNotesDraft(ret.notes ?? "");
  }, [ret?._id, ret?.updatedAt, ret?.status]);

  async function runAction(action: string, callback: () => Promise<void>) {
    setBusyAction(action);
    try {
      await callback();
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Action failed",
      );
    } finally {
      setBusyAction(null);
    }
  }

  function updateApprovalItem(
    orderItemId: string,
    field: keyof EditableApprovalItem,
    value: string,
  ) {
    setApprovalItems((current) =>
      current.map((item) =>
        item.orderItemId === orderItemId ? { ...item, [field]: value } : item,
      ),
    );
  }

  function updateReceiptItem(
    orderItemId: string,
    field: keyof EditableReceiptItem,
    value: string,
  ) {
    setReceiptItems((current) =>
      current.map((item) =>
        item.orderItemId === orderItemId ? { ...item, [field]: value } : item,
      ),
    );
  }

  async function handleApprove() {
    const amount = Math.round(Number(approvalRefundAmount) * 100);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a refund amount greater than 0.");
      return;
    }
    if (amount > approvalRefundLimit) {
      toast.error(
        `Refund amount cannot exceed approved item total ${formatMoney(
          approvalRefundLimit,
          ret?.order?.currencyCode,
        )}.`,
      );
      return;
    }

    const items = approvalItems.map((item) => ({
      orderItemId: item.orderItemId as any,
      quantityApproved: Number.parseInt(item.quantityApproved, 10),
      resolutionType: item.resolutionType,
    }));

    if (items.some((item) => Number.isNaN(item.quantityApproved))) {
      toast.error("Approved quantities must be whole numbers.");
      return;
    }

    await runAction("approve", async () => {
      await approveReturn({
        returnId: returnId as any,
        refundAmount: amount,
        items,
        ...(approvalNotes.trim() ? { notes: approvalNotes.trim() } : {}),
      });
      toast.success("Return approved");
      setApprovalNotes("");
    });
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      toast.error("Provide a rejection reason.");
      return;
    }

    await runAction("reject", async () => {
      await rejectReturn({
        returnId: returnId as any,
        reason: rejectReason.trim(),
      });
      toast.success("Return rejected");
      setRejectReason("");
    });
  }

  async function handleReceived() {
    const items = receiptItems.map((item) => ({
      orderItemId: item.orderItemId as any,
      quantityReceived: Number.parseInt(item.quantityReceived, 10),
      conditionCode: item.conditionCode,
      resolutionType: item.resolutionType,
    }));

    if (items.some((item) => Number.isNaN(item.quantityReceived))) {
      toast.error("Received quantities must be whole numbers.");
      return;
    }

    await runAction("received", async () => {
      await markReceived({
        returnId: returnId as any,
        items,
        ...(receiptTrackingNumber.trim()
          ? { trackingNumber: receiptTrackingNumber.trim() }
          : {}),
        ...(receiptNotes.trim() ? { notes: receiptNotes.trim() } : {}),
      });
      toast.success("Return marked received");
      setReceiptNotes("");
    });
  }

  async function handleRefund() {
    await runAction("refund", async () => {
      await processRefund({
        returnId: returnId as any,
        refundMethod,
        ...(refundNotes.trim() ? { notes: refundNotes.trim() } : {}),
      });
      toast.success(
        refundMethod === "original_payment"
          ? "Refund initiated"
          : "Refund recorded",
      );
      setRefundNotes("");
    });
  }

  async function handleComplete() {
    await runAction("complete", async () => {
      await completeReturn({
        returnId: returnId as any,
        ...(completionNotes.trim() ? { notes: completionNotes.trim() } : {}),
      });
      toast.success("Return completed");
      setCompletionNotes("");
    });
  }

  async function handleRetryStuckRefund() {
    await runAction("retryRefund", async () => {
      await retryStuckRefund({ returnId: returnId as any });
      toast.success("Refund retry initiated");
    });
  }

  async function handleAddLabel() {
    if (!labelUrl.trim()) {
      toast.error("Enter a shipping label URL.");
      return;
    }

    await runAction("label", async () => {
      await addShippingLabel({
        returnId: returnId as any,
        shippingLabelUrl: labelUrl.trim(),
        ...(labelTrackingNumber.trim()
          ? { trackingNumber: labelTrackingNumber.trim() }
          : {}),
        ...(labelCarrier.trim() ? { carrier: labelCarrier.trim() } : {}),
      });
      toast.success("Shipping label added");
    });
  }

  async function handleUpdateNotes() {
    await runAction("notes", async () => {
      await updateNotes({
        returnId: returnId as any,
        notes: notesDraft.trim(),
      });
      toast.success("Notes updated");
    });
  }

  return (
    <div className="space-y-6">
        <div className="space-y-2">
          <Link to="/commerce/returns" className="text-sm text-primary hover:underline">
            Back to returns
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Return Detail</h1>
            {ret ? <StatusBadge status={ret.status} /> : null}
          </div>
        </div>

        {ret === undefined ? (
          <div className="h-48 animate-pulse rounded-2xl bg-muted" />
        ) : !ret ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Return {returnId} was not found.
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-mono text-lg font-semibold text-foreground">
                    {ret.returnNumber}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Order {ret.order?.orderNumber ?? "--"} • Created{" "}
                    {formatDate(ret.createdAt)}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium text-foreground">
                    {ret.refundAmount
                      ? formatMoney(ret.refundAmount, ret.order?.currencyCode)
                      : "No refund set"}
                  </p>
                  <p className="text-muted-foreground">
                    Processed by {ret.processedByUser?.email ?? "--"}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-muted px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Customer
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {ret.user?.email ?? ret.order?.email ?? "Guest"}
                  </p>
                </div>
                <div className="rounded-2xl bg-muted px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Reason
                  </p>
                  <p className="mt-1 text-sm font-medium capitalize text-foreground">
                    {String(ret.reason ?? "").replace(/_/g, " ")}
                  </p>
                </div>
                <div className="rounded-2xl bg-muted px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Refund Method
                  </p>
                  <p className="mt-1 text-sm font-medium capitalize text-foreground">
                    {ret.refundMethod
                      ? String(ret.refundMethod).replace(/_/g, " ")
                      : "--"}
                  </p>
                </div>
                <div className="rounded-2xl bg-muted px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Tracking
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {ret.trackingNumber ?? "--"}
                  </p>
                </div>
              </div>

              {ret.reasonDetails ? (
                <div className="mt-4 rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
                  {ret.reasonDetails}
                </div>
              ) : null}

              {ret.refundFailureReason ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  Refund failure: {ret.refundFailureReason}
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Items</h2>
                {ret.order?._id ? (
                  <Link
                    to="/commerce/orders/$orderId"
                    params={{ orderId: ret.order._id }}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    View order
                  </Link>
                ) : null}
              </div>
              <div className="mt-4 space-y-3">
                {(ret.orderItems ?? []).map((item: any) => (
                  <div
                    key={item.orderItemId}
                    className="rounded-2xl border border-border px-4 py-4 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">
                          {item.orderItem?.productTitle ?? String(item.orderItemId).slice(-8)}
                        </p>
                        <p className="text-muted-foreground">
                          Requested {item.quantityRequested}
                          {item.quantityApproved !== undefined
                            ? ` • Approved ${item.quantityApproved}`
                            : ""}
                          {item.quantityReceived !== undefined
                            ? ` • Received ${item.quantityReceived}`
                            : ""}
                          {item.quantityRestocked !== undefined
                            ? ` • Restocked ${item.quantityRestocked}`
                            : ""}
                        </p>
                      </div>
                      {item.orderItem?.lineTotalAmount ? (
                        <p className="font-medium text-foreground">
                          {formatMoney(
                            item.orderItem.lineTotalAmount,
                            ret.order?.currencyCode,
                          )}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {item.reason ? <span>Reason: {item.reason}</span> : null}
                      {item.conditionCode ? (
                        <span>
                          Condition: {String(item.conditionCode).replace(/_/g, " ")}
                        </span>
                      ) : null}
                      {item.resolutionType ? (
                        <span>
                          Resolution: {String(item.resolutionType).replace(/_/g, " ")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                {ret.status === "requested" ? (
                  <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <div className="space-y-1">
                      <h2 className="text-xl font-semibold">Approve Return</h2>
                      <p className="text-sm text-muted-foreground">
                        Set approved quantities per item before moving this return
                        into the refund workflow.
                      </p>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Refund Amount
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={approvalRefundAmount}
                          onChange={(event) =>
                            setApprovalRefundAmount(event.target.value)
                          }
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                          Maximum based on approved item quantities:{" "}
                          {formatMoney(
                            approvalRefundLimit,
                            ret.order?.currencyCode,
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {approvalItems.map((item) => {
                        const source = (ret.orderItems ?? []).find(
                          (entry: any) =>
                            String(entry.orderItemId) === item.orderItemId,
                        );
                        return (
                          <div
                            key={item.orderItemId}
                            className="rounded-2xl border border-border px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-foreground">
                                  {source?.orderItem?.productTitle ??
                                    item.orderItemId.slice(-8)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Requested {source?.quantityRequested ?? 0}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <div>
                                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Quantity Approved
                                </label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={item.quantityApproved}
                                  onChange={(event) =>
                                    updateApprovalItem(
                                      item.orderItemId,
                                      "quantityApproved",
                                      event.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div>
                                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Resolution
                                </label>
                                <Select
                                  value={item.resolutionType}
                                  onValueChange={(value) =>
                                    updateApprovalItem(
                                      item.orderItemId,
                                      "resolutionType",
                                      value ?? "refund",
                                    )
                                  }
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {APPROVAL_RESOLUTION_OPTIONS.map((option) => (
                                      <SelectItem
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Approval Notes
                      </label>
                      <Textarea
                        value={approvalNotes}
                        onChange={(event) => setApprovalNotes(event.target.value)}
                        placeholder="Optional notes for the customer or support team."
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        onClick={handleApprove}
                        disabled={busyAction === "approve"}
                      >
                        {busyAction === "approve" ? "Approving..." : "Approve Return"}
                      </Button>
                    </div>
                  </section>
                ) : null}

                {ret.status === "requested" ? (
                  <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <div className="space-y-1">
                      <h2 className="text-xl font-semibold">Reject Return</h2>
                      <p className="text-sm text-muted-foreground">
                        Rejection remains an explicit operator decision with a
                        required reason.
                      </p>
                    </div>
                    <div className="mt-4">
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Rejection Reason
                      </label>
                      <Textarea
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                      />
                    </div>
                    <div className="mt-4">
                      <Button
                        variant="destructive"
                        onClick={handleReject}
                        disabled={busyAction === "reject"}
                      >
                        {busyAction === "reject" ? "Rejecting..." : "Reject Return"}
                      </Button>
                    </div>
                  </section>
                ) : null}

                {ret.status === "approved" ? (
                  <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <div className="space-y-1">
                      <h2 className="text-xl font-semibold">Receive Items</h2>
                      <p className="text-sm text-muted-foreground">
                        Capture actual received quantities and disposition before
                        any refund is processed.
                      </p>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Tracking Number
                        </label>
                        <Input
                          value={receiptTrackingNumber}
                          onChange={(event) =>
                            setReceiptTrackingNumber(event.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {receiptItems.map((item) => {
                        const source = (ret.orderItems ?? []).find(
                          (entry: any) =>
                            String(entry.orderItemId) === item.orderItemId,
                        );
                        return (
                          <div
                            key={item.orderItemId}
                            className="rounded-2xl border border-border px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-foreground">
                                  {source?.orderItem?.productTitle ??
                                    item.orderItemId.slice(-8)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Approved {source?.quantityApproved ?? 0}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-3">
                              <div>
                                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Quantity Received
                                </label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={item.quantityReceived}
                                  onChange={(event) =>
                                    updateReceiptItem(
                                      item.orderItemId,
                                      "quantityReceived",
                                      event.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div>
                                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Condition
                                </label>
                                <Select
                                  value={item.conditionCode}
                                  onValueChange={(value) =>
                                    updateReceiptItem(
                                      item.orderItemId,
                                      "conditionCode",
                                      value ?? "new",
                                    )
                                  }
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {RECEIPT_CONDITION_OPTIONS.map((option) => (
                                      <SelectItem
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Resolution
                                </label>
                                <Select
                                  value={item.resolutionType}
                                  onValueChange={(value) =>
                                    updateReceiptItem(
                                      item.orderItemId,
                                      "resolutionType",
                                      value ?? "restock",
                                    )
                                  }
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {RECEIPT_RESOLUTION_OPTIONS.map((option) => (
                                      <SelectItem
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Receipt Notes
                      </label>
                      <Textarea
                        value={receiptNotes}
                        onChange={(event) => setReceiptNotes(event.target.value)}
                      />
                    </div>

                    <div className="mt-4">
                      <Button
                        onClick={handleReceived}
                        disabled={busyAction === "received"}
                      >
                        {busyAction === "received"
                          ? "Saving..."
                          : "Mark Received"}
                      </Button>
                    </div>
                  </section>
                ) : null}

                {ret.status === "received" ? (
                  <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <div className="space-y-1">
                      <h2 className="text-xl font-semibold">Process Refund</h2>
                      <p className="text-sm text-muted-foreground">
                        Refund status follows the payment system. Original payment
                        refunds remain asynchronous.
                      </p>
                    </div>

                    <div className="mt-4 max-w-sm">
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Refund Method
                      </label>
                      <Select
                        value={refundMethod}
                        onValueChange={(value) =>
                          setRefundMethod(value ?? "original_payment")
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REFUND_METHOD_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Refund Notes
                      </label>
                      <Textarea
                        value={refundNotes}
                        onChange={(event) => setRefundNotes(event.target.value)}
                      />
                    </div>

                    <div className="mt-4">
                      <Button
                        onClick={handleRefund}
                        disabled={busyAction === "refund"}
                      >
                        {busyAction === "refund"
                          ? "Processing..."
                          : "Process Refund"}
                      </Button>
                    </div>
                  </section>
                ) : null}

                {ret.status === "refund_pending" ? (
                  <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
                    <div className="space-y-1">
                      <h2 className="text-xl font-semibold text-amber-900">
                        Refund pending
                      </h2>
                      <p className="text-sm text-amber-800">
                        The refund has been dispatched to the payment provider
                        but has not confirmed yet. If it appears stuck, retry
                        the provider refund. Only Stripe-backed refunds can be
                        retried automatically; for other providers, resolve
                        manually.
                      </p>
                    </div>
                    <div className="mt-4">
                      <Button
                        onClick={handleRetryStuckRefund}
                        disabled={busyAction === "retryRefund"}
                      >
                        {busyAction === "retryRefund"
                          ? "Retrying..."
                          : "Retry stuck refund"}
                      </Button>
                    </div>
                  </section>
                ) : null}

                {ret.status === "refunded" ? (
                  <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <div className="space-y-1">
                      <h2 className="text-xl font-semibold">Complete Return</h2>
                      <p className="text-sm text-muted-foreground">
                        Completion finalizes the return and restocks only received
                        quantities marked with the restock disposition.
                      </p>
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Completion Notes
                      </label>
                      <Textarea
                        value={completionNotes}
                        onChange={(event) =>
                          setCompletionNotes(event.target.value)
                        }
                      />
                    </div>

                    <div className="mt-4">
                      <Button
                        onClick={handleComplete}
                        disabled={busyAction === "complete"}
                      >
                        {busyAction === "complete"
                          ? "Completing..."
                          : "Complete Return"}
                      </Button>
                    </div>
                  </section>
                ) : null}

                {(ret.status === "approved" || ret.status === "received") ? (
                  <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <div className="space-y-1">
                      <h2 className="text-xl font-semibold">Shipping Label</h2>
                      <p className="text-sm text-muted-foreground">
                        Attach a label or update carrier details for warehouse and
                        customer visibility.
                      </p>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Label URL
                        </label>
                        <Input
                          value={labelUrl}
                          onChange={(event) => setLabelUrl(event.target.value)}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Carrier
                        </label>
                        <Input
                          value={labelCarrier}
                          onChange={(event) => setLabelCarrier(event.target.value)}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Tracking Number
                        </label>
                        <Input
                          value={labelTrackingNumber}
                          onChange={(event) =>
                            setLabelTrackingNumber(event.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <Button
                        variant="outline"
                        onClick={handleAddLabel}
                        disabled={busyAction === "label"}
                      >
                        {busyAction === "label"
                          ? "Saving..."
                          : "Save Shipping Label"}
                      </Button>
                    </div>
                  </section>
                ) : null}

                <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold">Internal Notes</h2>
                    <p className="text-sm text-muted-foreground">
                      These notes are appended to the return record and the audit
                      timeline.
                    </p>
                  </div>
                  <div className="mt-4">
                    <Textarea
                      value={notesDraft}
                      onChange={(event) => setNotesDraft(event.target.value)}
                    />
                  </div>
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      onClick={handleUpdateNotes}
                      disabled={busyAction === "notes"}
                    >
                      {busyAction === "notes" ? "Saving..." : "Save Notes"}
                    </Button>
                  </div>
                </section>
              </div>

              <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Timeline</h2>
                <div className="mt-4 space-y-3">
                  {(ret.history ?? []).length ? (
                    ret.history.map((entry: any) => (
                      <div
                        key={entry._id}
                        className="rounded-2xl border border-border px-4 py-4 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-medium capitalize text-foreground">
                            {String(entry.eventType).replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(entry.createdAt)}
                          </p>
                        </div>
                        {entry.fromStatus || entry.toStatus ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {entry.fromStatus ?? "--"} → {entry.toStatus ?? "--"}
                          </p>
                        ) : null}
                        {entry.note ? (
                          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                            {entry.note}
                          </p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No return history is available yet.
                    </p>
                  )}
                </div>
              </section>
            </section>
          </div>
        )}
    </div>
  );
}
