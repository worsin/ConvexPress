/**
 * Journal · order.track — guest order tracking as a receipt: the order
 * number in display type, lines as rule-separated rows, the summary on the
 * right, then shipments (with the carrier scan history as a ruled timeline)
 * and order activity as rule-separated lists. Same data as Core; the
 * tracking link opens in a new tab.
 */
import { Link } from "@tanstack/react-router";

import { getCartLineBundleSelections } from "@/components/commerce/cartLine";
import { formatMoney } from "@/lib/commerce/format";
import type { OrderTrackSurfaceData } from "@/templates/packs/core/surfaces/order.track";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Container, EmptyState, LinkButton, Rule, SectionHeading, SkeletonBlock, SmallCaps, buttonClasses } from "../parts";
import { AsideHeading, ReceiptList, ReceiptRow, ReceiptTotal, formatDateTime } from "../parts/extra-commerce";

function humanize(value: unknown) {
  return String(value ?? "").replace(/_/g, " ");
}

export default function JournalOrderTrack({ data }: SurfaceProps<OrderTrackSurfaceData>) {
  const { order, trackingTimeline } = data;
  const money = (amount: number) => formatMoney(amount, order?.currencyCode || "USD");
  const firstShipment = order?.shipments?.[0];
  const carrierService = [firstShipment?.carrier, firstShipment?.serviceName].filter(Boolean).join(" · ");

  return (
    <Container data-slot="order-track" className="flex flex-col gap-14 py-6 md:gap-20 md:py-10">
      <SectionHeading level={1} eyebrow="Order tracking" title="Track order" lede="Follow the order's progress and shipment activity from your tracking link." />

      {order === undefined ? (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16" aria-hidden="true">
          <SkeletonBlock className="h-56" />
          <SkeletonBlock className="h-64" />
        </div>
      ) : !order ? (
        <EmptyState
          eyebrow="Not found"
          title="The tracking link is invalid or the order could not be found."
          action={
            <LinkButton to="/products" variant="ghost">
              Continue shopping
            </LinkButton>
          }
        />
      ) : (
        <div className="flex flex-col gap-14 md:gap-20">
          {/* Items + summary */}
          <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16 lg:items-start">
            <section className="flex flex-col gap-8">
              <SectionHeading level={2} title={order.orderNumber || "Order"} />
              <ul className="flex flex-col divide-y divide-border border-y border-border" aria-label="Order items">
                {(order.items ?? []).map((item: any) => {
                  const selections = getCartLineBundleSelections(item.metadata);
                  return (
                    <li key={item._id} className="flex items-start justify-between gap-6 py-5">
                      <div className="flex min-w-0 flex-col gap-2">
                        <p className="font-display text-xl leading-snug text-foreground">{item.productTitle}</p>
                        {selections.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {selections.map((selection) => (
                              <Badge key={selection.componentId} className="normal-case tracking-normal">
                                {selection.productTitle}
                                {selection.quantity > 1 ? ` ×${selection.quantity}` : ""}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        <SmallCaps className="tabular-nums">Qty {item.quantity}</SmallCaps>
                      </div>
                      <p className="shrink-0 font-display text-lg tabular-nums text-foreground">{money(item.lineTotalAmount)}</p>
                    </li>
                  );
                })}
              </ul>
            </section>

            <aside className="flex flex-col gap-8 lg:sticky lg:top-28" aria-label="Order summary">
              <AsideHeading>Order summary</AsideHeading>
              <ReceiptList>
                <ReceiptRow label="Status" value={<span className="capitalize">{humanize(order.status)}</span>} />
                <ReceiptRow label="Payment" value={<span className="capitalize">{humanize(order.paymentStatus)}</span>} />
                <ReceiptRow label="Fulfillment" value={<span className="capitalize">{humanize(order.fulfillmentStatus)}</span>} />
                <ReceiptRow label="Shipping" value={order.selectedShippingMethodLabel || order.selectedShippingMethodCode || "Not required"} />
                {carrierService ? <ReceiptRow label="Carrier service" value={carrierService} /> : null}
                <ReceiptTotal value={money(order.totalAmount)} />
              </ReceiptList>
            </aside>
          </div>

          {/* Shipments */}
          <section className="flex flex-col gap-8">
            <SectionHeading level={2} title="Shipments" />
            {order.shipments?.length ? (
              <ul className="flex flex-col divide-y divide-border border-y border-border" aria-label="Shipments">
                {order.shipments.map((shipment: any) => {
                  const entry = trackingTimeline?.shipments?.find((row: any) => row.shipmentId === shipment._id);
                  const events: any[] = entry?.events ?? [];
                  return (
                    <li key={shipment._id} className="flex flex-col gap-4 py-6">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                        <div className="flex min-w-0 flex-col gap-1">
                          <p className="font-display text-xl leading-snug text-foreground">{shipment.shipmentNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            {shipment.carrier || "Carrier pending"}
                            {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ""}
                          </p>
                          {shipment.serviceName ? <p className="text-xs text-muted-foreground">{shipment.serviceName}</p> : null}
                        </div>
                        <SmallCaps className="text-foreground">{humanize(shipment.status)}</SmallCaps>
                      </div>
                      {shipment.trackingStatus ? <p className="text-xs text-muted-foreground">Provider status: {shipment.trackingStatus}</p> : null}
                      {events.length > 0 ? (
                        <ol className="flex flex-col gap-3 border-l border-border pl-5">
                          {events.map((event, index) => (
                            <li key={index} className="flex flex-col gap-0.5 text-sm">
                              <span className="font-medium capitalize text-foreground">{humanize(event.normalizedStatus)}</span>
                              <span className="text-muted-foreground">
                                {event.description ?? event.carrierStatus}
                                {event.location ? ` — ${event.location}` : ""}
                              </span>
                              <SmallCaps>{formatDateTime(event.occurredAt)}</SmallCaps>
                            </li>
                          ))}
                        </ol>
                      ) : null}
                      {shipment.trackingUrl ? (
                        <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" className="self-start text-sm font-medium text-foreground underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground">
                          Open tracking link
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="border-y border-border py-6 text-sm leading-6 text-muted-foreground">No shipments have been created yet.</p>
            )}
          </section>

          {/* Activity */}
          <section className="flex flex-col gap-8">
            <SectionHeading level={2} title="Order activity" />
            {order.history?.length ? (
              <ol className="flex flex-col divide-y divide-border border-y border-border" aria-label="Order activity">
                {order.history.map((entry: any) => (
                  <li key={entry._id} className="flex flex-col gap-1.5 py-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                      <span className="font-medium capitalize text-foreground">{humanize(entry.eventType)}</span>
                      <SmallCaps>{formatDateTime(entry.createdAt)}</SmallCaps>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">{entry.message}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="border-y border-border py-6 text-sm leading-6 text-muted-foreground">No guest-visible activity is available yet.</p>
            )}
          </section>

          <Rule />
          <div>
            <Link to="/products" className={buttonClasses("ghost")}>
              Continue shopping
            </Link>
          </div>
        </div>
      )}
    </Container>
  );
}
