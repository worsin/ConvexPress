/**
 * Depot · order.track — guest order tracking: the items as a table with a
 * sticky summary, then each shipment as a data-table timeline of carrier
 * scans (status, detail, location, time), then the order activity as a
 * table. Same data, links and empty states as Core.
 */
import { ExternalLink } from "lucide-react";

import { getCartLineBundleSelections } from "@/components/commerce/cartLine";
import { formatMoney } from "@/lib/commerce/format";
import type { OrderTrackSurfaceData } from "@/templates/packs/core/surfaces/order.track";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Card, Container, DataTable, EmptyState, Label, LinkButton, SectionHeading, Skeleton, StickyPanel, Td, Th } from "../parts";
import { PageHeader } from "../parts/extra-commerce";

function humanize(value: unknown) {
  return String(value ?? "").replace(/_/g, " ");
}

function when(value: unknown) {
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export default function DepotOrderTrack({ data }: SurfaceProps<OrderTrackSurfaceData>) {
  const { order, trackingTimeline } = data;
  const money = (amount: number) => formatMoney(amount, order?.currencyCode || "USD");
  const shipments: any[] = order?.shipments ?? [];
  const first = shipments[0];

  return (
    <Container padded={false} data-slot="order-track" className="flex flex-col gap-4 py-6 md:py-8">
      <PageHeader label="Order tracking" title={order?.orderNumber ? `Order ${order.orderNumber}` : "Track order"} description="Track order progress and shipment activity using your order tracking link." meta={order ? <Badge tone="new">{humanize(order.status)}</Badge> : undefined} />

      {order === undefined ? (
        <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <Skeleton className="h-48 xl:col-span-8" />
          <Skeleton className="h-56 xl:col-span-4" />
        </div>
      ) : !order ? (
        <EmptyState title="The tracking link is invalid or the order could not be found." action={<LinkButton to="/products" variant="secondary">Continue shopping</LinkButton>} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <div className="flex flex-col gap-6 xl:col-span-8">
            <section className="flex flex-col gap-3" aria-label="Items">
              <SectionHeading title="Items" count={(order.items ?? []).length} />
              <DataTable caption="Order items">
                <thead>
                  <tr>
                    <Th>Item</Th>
                    <Th>Qty</Th>
                    <Th className="text-right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items ?? []).map((item: any) => {
                    const selections = getCartLineBundleSelections(item.metadata);
                    return (
                      <tr key={item._id} className="border-t border-border">
                        <Td className="min-w-56">
                          <p className="text-sm font-semibold text-foreground">{item.productTitle}</p>
                          {selections.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {selections.map((selection) => (
                                <Badge key={selection.componentId} tone="stock" className="normal-case tracking-normal">
                                  {selection.productTitle}
                                  {selection.quantity > 1 ? ` x${selection.quantity}` : ""}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </Td>
                        <Td className="tabular-nums">{item.quantity}</Td>
                        <Td align="right" className="whitespace-nowrap font-semibold text-foreground">
                          {money(item.lineTotalAmount)}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </section>

            <section className="flex flex-col gap-3" aria-label="Shipments">
              <SectionHeading title="Shipments" count={shipments.length} />
              {shipments.length === 0 ? (
                <EmptyState title="No shipments have been created yet." className="py-6" />
              ) : (
                shipments.map((shipment: any) => {
                  const events: any[] = trackingTimeline?.shipments?.find((entry: any) => entry.shipmentId === shipment._id)?.events ?? [];
                  return (
                    <Card key={shipment._id} className="flex flex-col">
                      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <p className="text-sm font-semibold text-foreground">{shipment.shipmentNumber}</p>
                          <p className="text-[13px] text-muted-foreground">
                            {shipment.carrier || "Carrier pending"}
                            {shipment.serviceName ? ` · ${shipment.serviceName}` : ""}
                            {shipment.trackingNumber ? (
                              <>
                                {" · "}
                                <span className="tabular-nums">{shipment.trackingNumber}</span>
                              </>
                            ) : null}
                          </p>
                          {shipment.trackingStatus ? <Label>Provider status: {humanize(shipment.trackingStatus)}</Label> : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone="stock">{humanize(shipment.status)}</Badge>
                          {shipment.trackingUrl ? (
                            <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                              Open tracking link
                              <ExternalLink className="size-3.5" aria-hidden="true" />
                            </a>
                          ) : null}
                        </div>
                      </div>
                      {events.length > 0 ? (
                        <table className="w-full border-collapse text-[13px] text-foreground">
                          <caption className="sr-only">Tracking timeline for {shipment.shipmentNumber}</caption>
                          <thead>
                            <tr>
                              <Th>Status</Th>
                              <Th>Detail</Th>
                              <Th className="hidden md:table-cell">Location</Th>
                              <Th className="text-right">Time</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {events.map((event: any, index: number) => (
                              <tr key={index} className="border-t border-border">
                                <Td className="whitespace-nowrap font-semibold capitalize text-foreground">{humanize(event.normalizedStatus)}</Td>
                                <Td className="text-muted-foreground">
                                  {event.description ?? event.carrierStatus}
                                  {event.location ? <span className="block text-xs md:hidden">{event.location}</span> : null}
                                </Td>
                                <Td className="hidden text-muted-foreground md:table-cell">{event.location ?? "—"}</Td>
                                <Td align="right" className="whitespace-nowrap text-xs text-muted-foreground">
                                  {when(event.occurredAt)}
                                </Td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="px-3 py-2 text-[13px] text-muted-foreground">No carrier scans yet.</p>
                      )}
                    </Card>
                  );
                })
              )}
            </section>

            <section className="flex flex-col gap-3" aria-label="Order activity">
              <SectionHeading title="Order activity" count={(order.history ?? []).length} />
              {order.history?.length ? (
                <DataTable caption="Order activity">
                  <thead>
                    <tr>
                      <Th>Event</Th>
                      <Th>Message</Th>
                      <Th className="text-right">Time</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.history.map((entry: any) => (
                      <tr key={entry._id} className="border-t border-border">
                        <Td className="whitespace-nowrap font-semibold text-foreground">{humanize(entry.eventType)}</Td>
                        <Td className="text-muted-foreground">{entry.message}</Td>
                        <Td align="right" className="whitespace-nowrap text-xs text-muted-foreground">
                          {when(entry.createdAt)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              ) : (
                <EmptyState title="No guest-visible activity is available yet." className="py-6" />
              )}
            </section>
          </div>

          <StickyPanel label="Order summary" className="xl:col-span-4">
            <h2 className="text-lg font-semibold text-foreground">Order summary</h2>
            <DataTable
              caption="Order summary"
              firstColumnLabel
              rows={[
                { key: "status", cells: ["Status", <span className="capitalize">{humanize(order.status)}</span>] },
                { key: "payment", cells: ["Payment", <span className="capitalize">{humanize(order.paymentStatus)}</span>] },
                { key: "fulfillment", cells: ["Fulfillment", <span className="capitalize">{humanize(order.fulfillmentStatus)}</span>] },
                { key: "shipping", cells: ["Shipping", order.selectedShippingMethodLabel || order.selectedShippingMethodCode || "Not required"] },
                ...(first?.carrier || first?.serviceName ? [{ key: "carrier", cells: ["Carrier service", [first?.carrier, first?.serviceName].filter(Boolean).join(" • ")] }] : []),
                { key: "total", cells: [<span className="font-semibold text-foreground">Total</span>, <span className="text-lg font-semibold tabular-nums text-foreground">{money(order.totalAmount)}</span>] },
              ]}
            />
            <LinkButton to="/products" variant="secondary" className="w-full">
              Continue shopping
            </LinkButton>
          </StickyPanel>
        </div>
      )}
    </Container>
  );
}
