import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import { api } from "@backend/convex/_generated/api";
import { usePluginSettings } from "@/hooks/usePluginSettings";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/orders/$orderId",
)({
  component: CommerceOrderDetailPage,
});

function formatMoney(amount: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode || "USD",
  }).format(amount / 100);
}

function CommerceOrderDetailPage() {
  const { orderId } = Route.useParams();
  const { isEnabled } = usePluginSettings();
  const returnsEnabled = isEnabled("commerceReturns");
  const order = useQuery((api as any).commerce.orders.get, {
    orderId: orderId as any,
  }) as any;
  const returnsForOrder = useQuery(
    (api as any).commerceReturns.queries.getByOrder,
    returnsEnabled ? { orderId: orderId as any } : "skip",
  ) as any;
  const updateStatus = useMutation((api as any).commerce.orders.updateStatus);
  const updateFulfillment = useMutation(
    (api as any).commerce.orders.updateFulfillment,
  );
  const capturePayment = useMutation(
    (api as any).commerce.orders.capturePayment,
  );
  const createRefund = useMutation((api as any).commerce.orders.createRefund);
  const createShipment = useMutation((api as any).commerce.orders.createShipment);
  const updateShipmentStatus = useMutation(
    (api as any).commerce.orders.updateShipmentStatus,
  );
  const createShippingLabel = useAction(
    (api as any).shipping.actions.createShippingLabelForOrder,
  );
  const syncShipmentTracking = useAction(
    (api as any).shipping.actions.syncShipmentTracking,
  );

  const [status, setStatus] = useState("pending");
  const [statusNote, setStatusNote] = useState("");
  const [fulfillmentStatus, setFulfillmentStatus] = useState("unfulfilled");
  const [fulfillmentNote, setFulfillmentNote] = useState("");
  const [paymentProvider, setPaymentProvider] = useState("manual");
  const [paymentTxnId, setPaymentTxnId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [shipmentProvider, setShipmentProvider] = useState("");
  const [shipmentCarrier, setShipmentCarrier] = useState("");
  const [shipmentTrackingNumber, setShipmentTrackingNumber] = useState("");
  const [shipmentTrackingUrl, setShipmentTrackingUrl] = useState("");
  const [shipmentStatus, setShipmentStatus] = useState("label_created");
  const [shipmentNote, setShipmentNote] = useState("");
  const [shipmentStatusDrafts, setShipmentStatusDrafts] = useState<
    Record<string, string>
  >({});
  const providerCapabilities = useQuery(api.shipping.queries.getProviderCapabilities, {});

  const [isCreatingLabel, setIsCreatingLabel] = useState(false);
  const [syncingShipmentId, setSyncingShipmentId] = useState<string | null>(null);

  async function handleStatusUpdate() {
    try {
      await updateStatus({
        orderId: orderId as any,
        status,
        ...(statusNote.trim() ? { note: statusNote.trim() } : {}),
      });
      setStatusNote("");
      toast.success("Order status updated");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to update order status",
      );
    }
  }

  async function handleFulfillmentUpdate() {
    try {
      await updateFulfillment({
        orderId: orderId as any,
        fulfillmentStatus,
        ...(fulfillmentNote.trim() ? { note: fulfillmentNote.trim() } : {}),
      });
      setFulfillmentNote("");
      toast.success("Fulfillment status updated");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to update fulfillment",
      );
    }
  }

  async function handleCapturePayment() {
    try {
      await capturePayment({
        orderId: orderId as any,
        provider: paymentProvider,
        ...(paymentTxnId.trim()
          ? { providerTransactionId: paymentTxnId.trim() }
          : {}),
        ...(paymentAmount.trim()
          ? { amount: Math.round(Number(paymentAmount) * 100) }
          : {}),
        ...(paymentNote.trim() ? { note: paymentNote.trim() } : {}),
      });
      setPaymentTxnId("");
      setPaymentAmount("");
      setPaymentNote("");
      toast.success("Payment captured");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to capture payment",
      );
    }
  }

  async function handleCreateRefund() {
    try {
      await createRefund({
        orderId: orderId as any,
        amount: Math.round(Number(refundAmount) * 100),
        ...(refundReason.trim() ? { reason: refundReason.trim() } : {}),
      });
      setRefundAmount("");
      setRefundReason("");
      toast.success("Refund created");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to create refund",
      );
    }
  }

  async function handleCreateShipment() {
    try {
      await createShipment({
        orderId: orderId as any,
        status: shipmentStatus as any,
        ...(shipmentProvider.trim() ? { provider: shipmentProvider.trim() } : {}),
        ...(shipmentCarrier.trim() ? { carrier: shipmentCarrier.trim() } : {}),
        ...(shipmentTrackingNumber.trim()
          ? { trackingNumber: shipmentTrackingNumber.trim() }
          : {}),
        ...(shipmentTrackingUrl.trim()
          ? { trackingUrl: shipmentTrackingUrl.trim() }
          : {}),
        ...(shipmentNote.trim() ? { note: shipmentNote.trim() } : {}),
      });
      setShipmentProvider("");
      setShipmentCarrier("");
      setShipmentTrackingNumber("");
      setShipmentTrackingUrl("");
      setShipmentStatus("label_created");
      setShipmentNote("");
      toast.success("Shipment created");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to create shipment",
      );
    }
  }

  async function handleShipmentStatusUpdate(
    shipmentId: string,
    currentStatus: string,
  ) {
    try {
      await updateShipmentStatus({
        shipmentId: shipmentId as any,
        status: (shipmentStatusDrafts[shipmentId] ?? currentStatus) as any,
        ...(order?.shipments?.find((entry: any) => entry._id === shipmentId)?.provider
          ? {
              provider: order.shipments.find((entry: any) => entry._id === shipmentId)
                .provider,
            }
          : {}),
      });
      toast.success("Shipment updated");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to update shipment",
      );
    }
  }

  async function handleCreateProviderLabel() {
    try {
      setIsCreatingLabel(true);
      const result = await createShippingLabel({
        orderId: orderId as any,
      });
      toast.success(
        result?.trackingNumber
          ? `Label purchased: ${result.trackingNumber}`
          : "Shipping label purchased",
      );
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to purchase shipping label",
      );
    } finally {
      setIsCreatingLabel(false);
    }
  }

  async function handleSyncShipmentTracking(shipmentId: string) {
    try {
      setSyncingShipmentId(shipmentId);
      await syncShipmentTracking({
        shipmentId: shipmentId as any,
      });
      toast.success("Shipment tracking synced");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to sync shipment tracking",
      );
    } finally {
      setSyncingShipmentId(null);
    }
  }

  useEffect(() => {
    if (order?.status) {
      setStatus(order.status);
    }
    if (order?.fulfillmentStatus) {
      setFulfillmentStatus(order.fulfillmentStatus);
    }
    if (order?.shippingProvider) {
      setShipmentProvider((current) => current || String(order.shippingProvider));
    }
  }, [order?.fulfillmentStatus, order?.shippingProvider, order?.status]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link to="/commerce/orders" className="text-sm text-primary hover:underline">
          Back to orders
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Order Detail</h1>
      </div>

      {order === undefined ? (
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      ) : !order ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Order {orderId} was not found.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-xl font-semibold">{order.orderNumber || orderId}</h2>
              <div className="mt-6 space-y-4">
                {(order.items ?? []).map((item: any) => (
                  <div
                    key={item._id}
                    className="flex items-center justify-between gap-4 border-b border-border pb-4"
                  >
                    <div>
                      <p className="font-medium text-foreground">{item.productTitle}</p>
                      {(item.metadata?.optionSummary || item.metadata?.variantTitle || item.variantTitle) ? (
                        <p className="text-sm text-muted-foreground">
                          {item.metadata?.optionSummary ?? item.metadata?.variantTitle ?? item.variantTitle}
                        </p>
                      ) : null}
                      <p className="text-sm text-muted-foreground">
                        Qty {item.quantity}
                        {(item.metadata?.variantSku || item.sku) ? ` • SKU ${item.metadata?.variantSku ?? item.sku}` : ""}
                      </p>
                      {item.metadata?.lineType === "bundle" &&
                      Array.isArray(item.metadata?.selections) ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.metadata.selections.map((selection: any) => (
                            <span
                              key={selection.componentId}
                              className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                            >
                              {selection.productTitle}
                              {selection.quantity > 1 ? ` x${selection.quantity}` : ""}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <p className="font-medium text-foreground">
                      {formatMoney(item.lineTotalAmount, order.currencyCode)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <aside className="space-y-6">
              <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Summary</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="font-medium text-foreground">{order.status}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Payment status</dt>
                    <dd className="font-medium text-foreground">{order.paymentStatus}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Fulfillment</dt>
                    <dd className="font-medium text-foreground">
                      {order.fulfillmentStatus}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Payment method</dt>
                    <dd className="font-medium text-foreground">
                      {order.selectedPaymentMethodLabel ||
                        order.selectedPaymentMethodCode ||
                        "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Shipping method</dt>
                    <dd className="font-medium text-foreground">
                      {order.selectedShippingMethodLabel ||
                        order.selectedShippingMethodCode ||
                        "Not required"}
                    </dd>
                  </div>
                  {order.discountAmount > 0 ? (
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">
                        Discount
                        {order.appliedDiscountCode
                          ? ` (${order.appliedDiscountCode})`
                          : ""}
                      </dt>
                      <dd className="font-medium text-foreground">
                        -{formatMoney(order.discountAmount, order.currencyCode)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <dt className="text-muted-foreground">Total</dt>
                    <dd className="text-lg font-semibold text-foreground">
                      {formatMoney(order.totalAmount, order.currencyCode)}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Customer</h2>
                <div className="mt-4 space-y-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Email</p>
                    <p className="font-medium text-foreground">{order.email}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Billing address</p>
                    <p className="font-medium text-foreground">
                      {order.billingAddress?.line1}, {order.billingAddress?.city},{" "}
                      {order.billingAddress?.countryCode}
                    </p>
                  </div>
                  {order.shippingAddress ? (
                    <div>
                      <p className="text-muted-foreground">Shipping address</p>
                      <p className="font-medium text-foreground">
                        {order.shippingAddress.line1}, {order.shippingAddress.city},{" "}
                        {order.shippingAddress.countryCode}
                      </p>
                    </div>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Operations</h2>
              <div className="mt-6 space-y-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Order status
                  </h3>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  >
                    {[
                      "pending",
                      "processing",
                      "paid",
                      "fulfilled",
                      "completed",
                      "cancelled",
                      "refunded",
                      "failed",
                    ].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <input
                    value={statusNote}
                    onChange={(event) => setStatusNote(event.target.value)}
                    placeholder="Optional note"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleStatusUpdate()}
                    className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    Update status
                  </button>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Fulfillment
                  </h3>
                  <select
                    value={fulfillmentStatus}
                    onChange={(event) => setFulfillmentStatus(event.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  >
                    {["unfulfilled", "partial", "fulfilled"].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <input
                    value={fulfillmentNote}
                    onChange={(event) => setFulfillmentNote(event.target.value)}
                    placeholder="Optional fulfillment note"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleFulfillmentUpdate()}
                    className="inline-flex rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground"
                  >
                    Update fulfillment
                  </button>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Capture payment
                  </h3>
                  <input
                    value={paymentProvider}
                    onChange={(event) => setPaymentProvider(event.target.value)}
                    placeholder="Provider"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                  <input
                    value={paymentTxnId}
                    onChange={(event) => setPaymentTxnId(event.target.value)}
                    placeholder="Provider transaction ID"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                  <input
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    placeholder={`Amount (${order.currencyCode})`}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                  <input
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                    placeholder="Optional payment note"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCapturePayment()}
                    className="inline-flex rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground"
                  >
                    Record payment
                  </button>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Provider label
                  </h3>
                  <div className="rounded-xl border border-border bg-background px-4 py-4 text-sm">
                    <p className="font-medium text-foreground">
                      {order.shippingProvider
                        ? `Selected live ${String(order.shippingProvider).toUpperCase()} rate is attached to this order.`
                        : "No supported live-rate provider is attached to this order."}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {order.shippingCarrierName || order.shippingServiceName
                        ? [order.shippingCarrierName, order.shippingServiceName]
                            .filter(Boolean)
                            .join(" • ")
                        : "Automatic label purchase is only available when checkout selected a supported live-rate quote."}
                    </p>
                    {(() => {
                      const orderProvider = order.shippingProvider;
                      const providerCaps = providerCapabilities?.find(
                        (p: any) => p.provider === orderProvider,
                      );
                      const existingLabel = order.shipments?.some(
                        (shipment: any) =>
                          shipment.provider === orderProvider &&
                          shipment.externalLabelId,
                      );
                      const canBuyLabel = Boolean(
                        orderProvider &&
                          providerCaps?.supportsLabels &&
                          !existingLabel,
                      );
                      const labelButtonTitle = !orderProvider
                        ? "No shipping provider on this order"
                        : !providerCaps?.supportsLabels
                          ? `${String(orderProvider).toUpperCase()} does not support label purchase`
                          : existingLabel
                            ? "Label already purchased"
                            : undefined;
                      return (
                        <button
                          type="button"
                          onClick={() => void handleCreateProviderLabel()}
                          disabled={!canBuyLabel || isCreatingLabel}
                          title={labelButtonTitle}
                          className="mt-4 inline-flex rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isCreatingLabel
                            ? "Purchasing label..."
                            : `Buy ${String(order.shippingProvider || "provider").toUpperCase()} label`}
                        </button>
                      );
                    })()}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Create shipment
                  </h3>
                  <select
                    value={shipmentProvider}
                    onChange={(event) => setShipmentProvider(event.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  >
                    <option value="">Manual / none</option>
                    <option value="shipstation">ShipStation</option>
                    <option value="ups">UPS</option>
                    <option value="usps">USPS</option>
                    <option value="fedex">FedEx</option>
                    <option value="dhl">DHL</option>
                  </select>
                  <input
                    value={shipmentCarrier}
                    onChange={(event) => setShipmentCarrier(event.target.value)}
                    placeholder="Carrier"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                  <input
                    value={shipmentTrackingNumber}
                    onChange={(event) =>
                      setShipmentTrackingNumber(event.target.value)
                    }
                    placeholder="Tracking number"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                  <input
                    value={shipmentTrackingUrl}
                    onChange={(event) => setShipmentTrackingUrl(event.target.value)}
                    placeholder="Tracking URL"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                  <select
                    value={shipmentStatus}
                    onChange={(event) => setShipmentStatus(event.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  >
                    {["label_created", "shipped", "delivered"].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <input
                    value={shipmentNote}
                    onChange={(event) => setShipmentNote(event.target.value)}
                    placeholder="Shipment note"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateShipment()}
                    className="inline-flex rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground"
                  >
                    Create shipment
                  </button>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Create refund
                  </h3>
                  <input
                    value={refundAmount}
                    onChange={(event) => setRefundAmount(event.target.value)}
                    placeholder={`Amount (${order.currencyCode})`}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                  <input
                    value={refundReason}
                    onChange={(event) => setRefundReason(event.target.value)}
                    placeholder="Refund reason"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateRefund()}
                    className="inline-flex rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground"
                  >
                    Create refund
                  </button>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Payments</h2>
                <div className="mt-4 space-y-3">
                  {order.transactions?.length ? (
                    order.transactions.map((transaction: any) => (
                      <div
                        key={transaction._id}
                        className="rounded-xl border border-border px-4 py-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-foreground">
                            {transaction.provider}
                          </span>
                          <span className="text-muted-foreground">
                            {formatMoney(
                              transaction.amount.amount,
                              transaction.amount.currencyCode,
                            )}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {transaction.status}
                          {transaction.providerTransactionId
                            ? ` • ${transaction.providerTransactionId}`
                            : ""}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No payment transactions recorded yet.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Refunds</h2>
                <div className="mt-4 space-y-3">
                  {order.refunds?.length ? (
                    order.refunds.map((refund: any) => (
                      <div
                        key={refund._id}
                        className="rounded-xl border border-border px-4 py-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-foreground">
                            {formatMoney(refund.amount.amount, refund.amount.currencyCode)}
                          </span>
                          <span className="text-muted-foreground">
                            {refund.status}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {refund.reason || "No reason provided"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No refunds recorded yet.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Shipments</h2>
                <div className="mt-4 space-y-3">
                  {order.shipments?.length ? (
                    order.shipments.map((shipment: any) => (
                      <div
                        key={shipment._id}
                        className="rounded-xl border border-border px-4 py-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">
                              {shipment.shipmentNumber}
                            </p>
                            <p className="text-muted-foreground">
                              {shipment.carrier || "Carrier pending"}
                              {shipment.trackingNumber
                                ? ` • ${shipment.trackingNumber}`
                                : ""}
                            </p>
                            {shipment.serviceName ? (
                              <p className="text-xs text-muted-foreground">
                                {shipment.serviceName}
                              </p>
                            ) : null}
                          </div>
                          <span className="text-muted-foreground">
                            {shipment.status}
                          </span>
                        </div>
                        {shipment.labelUrl ? (
                          <a
                            href={shipment.labelUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex text-xs text-primary hover:underline"
                          >
                            Open label
                          </a>
                        ) : null}
                        {shipment.trackingUrl ? (
                          <a
                            href={shipment.trackingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex text-xs text-primary hover:underline"
                          >
                            Open tracking link
                          </a>
                        ) : null}
                        {shipment.trackingStatus ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Provider tracking status: {shipment.trackingStatus}
                          </p>
                        ) : null}
                        <div className="mt-3 flex items-center gap-2">
                          <select
                            value={
                              shipmentStatusDrafts[shipment._id] ?? shipment.status
                            }
                            onChange={(event) =>
                              setShipmentStatusDrafts((current) => ({
                                ...current,
                                [shipment._id]: event.target.value,
                              }))
                            }
                            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                          >
                            {["label_created", "shipped", "delivered", "returned"].map(
                              (value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ),
                            )}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              void handleShipmentStatusUpdate(
                                shipment._id,
                                shipment.status,
                              )
                            }
                            className="inline-flex rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground"
                          >
                            Update
                          </button>
                          {(() => {
                            const canSyncTracking = Boolean(
                              shipment.provider &&
                                providerCapabilities?.find(
                                  (p: any) => p.provider === shipment.provider,
                                )?.supportsTracking &&
                                shipment.trackingNumber,
                            );
                            return canSyncTracking ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleSyncShipmentTracking(shipment._id)
                                }
                                disabled={syncingShipmentId === shipment._id}
                                className="inline-flex rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {syncingShipmentId === shipment._id
                                  ? "Syncing..."
                                  : "Sync tracking"}
                              </button>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No shipments created yet.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Returns</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Return requests linked to this order.
                    </p>
                  </div>
                  <Link
                    to="/commerce/returns"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Open returns queue
                  </Link>
                </div>
                <div className="mt-4 space-y-3">
                  {returnsForOrder === undefined ? (
                    <div className="h-20 animate-pulse rounded-xl bg-muted" />
                  ) : returnsForOrder?.length ? (
                    returnsForOrder.map((ret: any) => (
                      <div
                        key={ret._id}
                        className="rounded-xl border border-border px-4 py-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">
                              {ret.returnNumber}
                            </p>
                            <p className="text-muted-foreground">
                              {String(ret.status).replace(/_/g, " ")} •{" "}
                              {new Date(ret.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <Link
                            to="/commerce/returns/$returnId"
                            params={{ returnId: ret._id }}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            View return
                          </Link>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No returns exist for this order.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold">History</h2>
                <div className="mt-4 space-y-3">
                  {(order.history ?? []).length ? (
                    order.history.map((entry: any) => (
                      <div
                        key={entry._id}
                        className="rounded-xl border border-border px-4 py-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-foreground">
                            {entry.eventType}
                          </span>
                          <span className="text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{entry.message}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Order history is empty.
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
