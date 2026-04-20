import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";

export const Route = createFileRoute("/dashboard/orders/$orderId")({
  component: DashboardOrderDetailPage,
});

function formatDate(ts: number | undefined) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DashboardOrderDetailPage() {
  const { orderId } = Route.useParams();
  const settings = useQuery(api.settings.queries.getPublic) as any;
  const returnsEnabled =
    settings !== undefined &&
    settings?.plugins?.commerceReturnsEnabled === true;
  const order = useQuery(api.commerce.orders.getMineById, {
    orderId: orderId as any,
  }) as any;
  const eligibility = useQuery(
    api.commerceReturns.queries.getMyOrderEligibility,
    returnsEnabled ? { orderId: orderId as any } : "skip",
  ) as any;
  const existingReturns = useQuery(
    api.commerceReturns.queries.getMineByOrder,
    returnsEnabled ? { orderId: orderId as any } : "skip",
  ) as any;

  return (
    <PublicPluginGate pluginId="commerce">
      <div className="space-y-6">
        <div className="space-y-2">
          <Link to="/dashboard/orders" className="text-sm text-primary hover:underline">
            Back to orders
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Order Detail</h1>
        </div>

        {order === undefined ? (
          <div className="h-48 animate-pulse rounded-[2rem] bg-muted" />
        ) : !order ? (
          <div className="rounded-[2rem] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Order {orderId} was not found.
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
              <h2 className="text-xl font-semibold">
                {order.orderNumber || orderId}
              </h2>
              <div className="mt-6 space-y-4">
                {(order.items ?? []).map((item: any) => (
                  <div
                    key={item._id}
                    className="flex items-center justify-between gap-4 border-b border-border pb-4"
                  >
                    <div>
                      <p className="font-medium text-foreground">{item.productTitle}</p>
                      {(() => {
                        const variantLabel =
                          item.metadata?.optionSummary ||
                          item.metadata?.variantTitle ||
                          item.variantTitle ||
                          null;
                        return variantLabel ? (
                          <p className="text-sm text-muted-foreground">
                            {variantLabel}
                          </p>
                        ) : null;
                      })()}
                      <p className="text-sm text-muted-foreground">
                        Quantity {item.quantity}
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
                      {item.metadata?.variantSku ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          SKU: {item.metadata.variantSku}
                        </p>
                      ) : null}
                    </div>
                    <p className="font-medium text-foreground">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: order.currencyCode || "USD",
                      }).format(item.lineTotalAmount / 100)}
                    </p>
                  </div>
                ))}
              </div>
              </section>

              <aside className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Summary</h2>
                <dl className="mt-6 space-y-4 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="font-medium text-foreground">{order.status}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Payment</dt>
                    <dd className="font-medium text-foreground">{order.paymentStatus}</dd>
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
                    <dt className="text-muted-foreground">Fulfillment</dt>
                    <dd className="font-medium text-foreground">
                      {order.fulfillmentStatus}
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
                  {order.shippingCarrierName || order.shippingServiceName ? (
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Carrier service</dt>
                      <dd className="font-medium text-foreground">
                        {[order.shippingCarrierName, order.shippingServiceName]
                          .filter(Boolean)
                          .join(" • ")}
                      </dd>
                    </div>
                  ) : null}
                  {order.discountAmount > 0 ? (
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">
                        Discount
                        {order.appliedDiscountCode
                          ? ` (${order.appliedDiscountCode})`
                          : ""}
                      </dt>
                      <dd className="font-medium text-foreground">
                        -
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: order.currencyCode || "USD",
                        }).format(order.discountAmount / 100)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Total</dt>
                    <dd className="font-semibold text-foreground">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: order.currencyCode || "USD",
                      }).format(order.totalAmount / 100)}
                    </dd>
                  </div>
                </dl>
              </aside>
            </div>

            <section className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Shipments</h2>
              <div className="mt-6 space-y-4">
                {order.shipments?.length ? (
                  order.shipments.map((shipment: any) => (
                    <div
                      key={shipment._id}
                      className="rounded-2xl border border-border px-4 py-4 text-sm"
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
                      {shipment.trackingStatus ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Provider status: {shipment.trackingStatus}
                        </p>
                      ) : null}
                      {shipment.labelUrl ? (
                        <a
                          href={shipment.labelUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 mr-4 inline-flex text-xs text-primary hover:underline"
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
                          Track shipment
                        </a>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No shipment records yet.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Returns</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Request a return for eligible items and track existing RMAs.
                  </p>
                </div>
                {eligibility?.isEligible ? (
                  <Link
                    to="/dashboard/orders/$orderId/return"
                    params={{ orderId }}
                    className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    Request return
                  </Link>
                ) : null}
              </div>

              {!eligibility ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Returns are unavailable for this order.
                </p>
              ) : eligibility.isEligible ? (
                <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                  <p>
                    {eligibility.items.filter((item: any) => item.eligible).length} item(s) still have returnable quantity.
                  </p>
                  {eligibility.returnWindowEndsAt ? (
                    <p>Eligible until {formatDate(eligibility.returnWindowEndsAt)}.</p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                  <p>{eligibility.ineligibleReason}</p>
                  {eligibility.returnWindowEndsAt ? (
                    <p>
                      Policy window: {eligibility.returnWindowDays}-day return window ending{" "}
                      {formatDate(eligibility.returnWindowEndsAt)}.
                    </p>
                  ) : null}
                </div>
              )}

              {existingReturns?.length ? (
                <div className="mt-4 space-y-3">
                  {existingReturns.map((ret: any) => (
                    <div
                      key={ret._id}
                      className="rounded-2xl border border-border px-4 py-4 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">
                            {ret.returnNumber}
                          </p>
                          <p className="text-muted-foreground">
                            Submitted {new Date(ret.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <span className="capitalize text-muted-foreground">
                          {ret.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <Link
                        to={"/dashboard/returns/$returnId" as any}
                        params={{ returnId: ret._id } as any}
                        className="mt-3 inline-flex text-xs font-medium text-primary hover:underline"
                      >
                        View return details
                      </Link>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </PublicPluginGate>
  );
}
