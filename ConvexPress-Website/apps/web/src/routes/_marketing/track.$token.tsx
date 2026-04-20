import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { getCartLineBundleSelections } from "@/components/commerce/cartLine";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useSettings } from "@/contexts/SettingsContext";

function formatMoney(amount: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode || "USD",
  }).format(amount / 100);
}

export const Route = createFileRoute("/_marketing/track/$token")({
  component: TrackOrderPage,
});

function TrackOrderPage() {
  const { token } = Route.useParams();
  const settings = useSettings();
  const commerceEnabled = settings?.plugins?.commerceEnabled === true;
  const order = useQuery(
    (api as any).commerce.orders.getByTrackingToken,
    commerceEnabled ? { trackingToken: token } : "skip",
  ) as any;
  // PRD D2 §2.1 — pull per-shipment tracking timeline so the page shows
  // actual carrier scan history, not just order status.
  const trackingTimeline = useQuery(
    (api as any).shipping.tracking.queries.publicTracking,
    commerceEnabled ? { trackingToken: token } : "skip",
  ) as any;

  return (
    <PublicPluginGate pluginId="commerce">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 py-12">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">Track Order</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Track order progress and shipment activity using your order tracking
            link.
          </p>
        </div>

        {order === undefined ? (
          <div className="h-48 animate-pulse rounded-[2rem] bg-muted" />
        ) : !order ? (
          <div className="rounded-[2rem] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            The tracking link is invalid or the order could not be found.
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
                <h2 className="text-xl font-semibold">
                  {order.orderNumber || "Order"}
                </h2>
                <div className="mt-6 space-y-4">
                  {(order.items ?? []).map((item: any) => (
                    <div
                      key={item._id}
                      className="flex items-center justify-between gap-4 border-b border-border pb-4"
                    >
                      <div>
                        <p className="font-medium text-foreground">{item.productTitle}</p>
                        <p className="text-sm text-muted-foreground">
                          Quantity {item.quantity}
                        </p>
                        {getCartLineBundleSelections(item.metadata).length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {getCartLineBundleSelections(item.metadata).map(
                              (selection) => (
                                <span
                                  key={selection.componentId}
                                  className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                                >
                                  {selection.productTitle}
                                  {selection.quantity > 1
                                    ? ` x${selection.quantity}`
                                    : ""}
                                </span>
                              ),
                            )}
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

              <aside className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Order summary</h2>
                <dl className="mt-6 space-y-4 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="font-medium text-foreground">{order.status}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Payment</dt>
                    <dd className="font-medium text-foreground">
                      {order.paymentStatus}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Fulfillment</dt>
                    <dd className="font-medium text-foreground">
                      {order.fulfillmentStatus}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Shipping</dt>
                    <dd className="font-medium text-foreground">
                      {order.selectedShippingMethodLabel ||
                        order.selectedShippingMethodCode ||
                        "Not required"}
                    </dd>
                  </div>
                  {order.shipments?.[0]?.carrier || order.shipments?.[0]?.serviceName ? (
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Carrier service</dt>
                      <dd className="font-medium text-foreground">
                        {[order.shipments?.[0]?.carrier, order.shipments?.[0]?.serviceName]
                          .filter(Boolean)
                          .join(" • ")}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Total</dt>
                    <dd className="font-semibold text-foreground">
                      {formatMoney(order.totalAmount, order.currencyCode)}
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
                      {(() => {
                        const timelineEntry = trackingTimeline?.shipments?.find(
                          (s: any) => s.shipmentId === shipment._id,
                        );
                        const events = timelineEntry?.events ?? [];
                        if (events.length === 0) return null;
                        return (
                          <ol className="mt-3 space-y-2 border-l border-border pl-4">
                            {events.map((evt: any, idx: number) => (
                              <li key={idx} className="text-xs">
                                <div className="font-medium capitalize text-foreground">
                                  {String(evt.normalizedStatus).replace(/_/g, " ")}
                                </div>
                                <div className="text-muted-foreground">
                                  {evt.description ?? evt.carrierStatus}
                                  {evt.location ? ` — ${evt.location}` : ""}
                                </div>
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {new Date(evt.occurredAt).toLocaleString()}
                                </div>
                              </li>
                            ))}
                          </ol>
                        );
                      })()}
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
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No shipments have been created yet.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Order activity</h2>
              <div className="mt-6 space-y-3">
                {order.history?.length ? (
                  order.history.map((entry: any) => (
                    <div
                      key={entry._id}
                      className="rounded-2xl border border-border px-4 py-4 text-sm"
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
                    No guest-visible activity is available yet.
                  </p>
                )}
              </div>
            </section>

            <div>
              <Link
                to="/products"
                className="inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-medium text-foreground"
              >
                Continue shopping
              </Link>
            </div>
          </div>
        )}
      </div>
    </PublicPluginGate>
  );
}
