import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ArrowLeft, RotateCcw, CheckCircle2 } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

export const Route = createFileRoute("/dashboard/orders/$orderId/return")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: OrderReturnPage,
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

const REASON_OPTIONS = [
  { value: "defective", label: "Defective / Damaged" },
  { value: "wrong_item", label: "Wrong Item Received" },
  { value: "not_as_described", label: "Not As Described" },
  { value: "changed_mind", label: "Changed My Mind" },
  { value: "other", label: "Other" },
];

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

function OrderReturnPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();

  const order = useQuery((api as any).commerce.orders.getMineById, {
    orderId: orderId as any,
  }) as any;

  const requestReturn = useMutation(
    (api as any).commerceReturns.mutations.requestReturn,
  );

  const [selectedItems, setSelectedItems] = useState<
    Record<string, { selected: boolean; quantity: number; reason: string }>
  >({});
  const [mainReason, setMainReason] = useState("defective");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{
    returnNumber: string;
  } | null>(null);

  function toggleItem(itemId: string, maxQty: number) {
    setSelectedItems((prev) => {
      const current = prev[itemId];
      if (current?.selected) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [itemId]: { selected: true, quantity: maxQty, reason: "" },
      };
    });
  }

  function updateItemQuantity(itemId: string, quantity: number) {
    setSelectedItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], quantity },
    }));
  }

  function updateItemReason(itemId: string, reason: string) {
    setSelectedItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], reason },
    }));
  }

  const selectedCount = Object.values(selectedItems).filter(
    (i) => i.selected,
  ).length;

  async function handleSubmit() {
    if (selectedCount === 0) {
      toast.error("Please select at least one item to return");
      return;
    }

    const items = Object.entries(selectedItems)
      .filter(([, v]) => v.selected)
      .map(([itemId, v]) => ({
        orderItemId: itemId as any,
        quantity: v.quantity,
        ...(v.reason ? { reason: v.reason } : {}),
      }));

    setSubmitting(true);
    try {
      const result = await requestReturn({
        orderId: orderId as any,
        reason: mainReason,
        ...(additionalNotes.trim()
          ? { reasonDetails: additionalNotes.trim() }
          : {}),
        items,
      });
      setSubmitted({ returnNumber: result.returnNumber });
      toast.success("Return request submitted");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to submit return request",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Success state
  if (submitted) {
    return (
      <div className="space-y-6">
        <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-foreground">
            Return Request Submitted
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your return request has been submitted successfully. We will review
            it and get back to you soon.
          </p>
          <div className="mt-4 rounded-xl bg-muted px-4 py-3">
            <p className="text-xs text-muted-foreground">Return Number</p>
            <p className="font-mono text-lg font-bold text-foreground">
              {submitted.returnNumber}
            </p>
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              to="/dashboard/returns"
              className="inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              View My Returns
            </Link>
            <button
              type="button"
              onClick={() =>
                navigate({
                  to: "/dashboard",
                })
              }
              className="inline-flex rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() =>
            navigate({
              to: "/dashboard",
            })
          }
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h1 className="text-sm font-medium text-foreground">
          Request a Return
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Select items you'd like to return and provide a reason.
        </p>
      </div>

      {/* Loading */}
      {order === undefined ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl bg-muted"
            />
          ))}
        </div>
      ) : !order ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Order not found or you don't have access to this order.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Order info */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Order</p>
                <p className="font-mono text-sm font-semibold text-foreground">
                  {order.orderNumber}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatMoney(
                    order.totalAmount ?? 0,
                    order.currencyCode ?? "USD",
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Select items */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Select Items to Return
            </h2>
            {(order.items ?? []).map((item: any) => {
              const isSelected = selectedItems[item._id]?.selected;
              return (
                <div
                  key={item._id}
                  className={`rounded-2xl border p-4 transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={!!isSelected}
                      onChange={() =>
                        toggleItem(item._id, item.quantity ?? 1)
                      }
                      className="mt-1 h-4 w-4 rounded border-border"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {item.productTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ordered Qty: {item.quantity}
                        {item.sku ? ` - SKU: ${item.sku}` : ""}
                        {" - "}
                        {formatMoney(
                          item.lineTotalAmount ?? item.unitPriceAmount ?? 0,
                          order.currencyCode ?? "USD",
                        )}
                      </p>

                      {isSelected && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center gap-3">
                            <label className="text-xs text-muted-foreground">
                              Return qty:
                            </label>
                            <select
                              value={
                                selectedItems[item._id]?.quantity ??
                                item.quantity
                              }
                              onChange={(e) =>
                                updateItemQuantity(
                                  item._id,
                                  Number(e.target.value),
                                )
                              }
                              className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
                            >
                              {Array.from(
                                { length: item.quantity ?? 1 },
                                (_, i) => i + 1,
                              ).map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>
                          <input
                            value={selectedItems[item._id]?.reason ?? ""}
                            onChange={(e) =>
                              updateItemReason(item._id, e.target.value)
                            }
                            placeholder="Item-specific reason (optional)"
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reason */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reason for Return
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {REASON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMainReason(opt.value)}
                  className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                    mainReason === opt.value
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Additional Notes
            </h2>
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder="Provide any additional details about your return..."
              rows={4}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">
              {selectedCount === 0
                ? "Select items to return"
                : `${selectedCount} item(s) selected for return`}
            </p>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={selectedCount === 0 || submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              {submitting ? "Submitting..." : "Submit Return Request"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
