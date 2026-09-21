/**
 * Depot · dashboard.order — one order as tables: line items 8/12 beside a
 * sticky summary 4/12, then payments, shipments and the returns box
 * (eligibility + existing RMAs). A non-storefront purchase (form order,
 * subscription invoice, …) renders the purchase ledger view. Same data,
 * links and gates as Core.
 */
import { orderAmountRows, carrierServiceLabel, recordedOrderMoney } from "@/lib/commerce/order-summary";
import { Link } from "@tanstack/react-router";

import type { DashboardOrderSurfaceData } from "@/templates/packs/core/surfaces/dashboard.order";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Card, DataTable, EmptyState, Skeleton, StickyPanel, Td, Th, buttonClasses } from "../parts";
import { DashboardPageHeader, DashboardSection, StatusBadge, dateOrDash, formatDateTime } from "../parts/extra-dashboard";

const PURCHASE_SOURCE_LABEL: Record<string, string> = {
  storefront_order: "Storefront order",
  form_order: "Form order",
  subscription_signup: "Subscription signup",
  subscription_invoice: "Subscription invoice",
  manual: "Manual order",
  api: "Order",
};

export default function DepotDashboardOrder({ data }: SurfaceProps<DashboardOrderSurfaceData>) {
  const { orderId, purchase, order, eligibility, existingReturns, hrefs } = data;
  const loading = purchase === undefined || (purchase && purchase.sourceType === "storefront_order" && order === undefined) || (!purchase && order === undefined);

  return (
    <div data-slot="dashboard-order" data-pack="depot" className="flex flex-col gap-4">
      <DashboardPageHeader
        eyebrow="Shop"
        title={purchase && purchase.sourceType !== "storefront_order" ? purchase.orderNumber || purchase._id : order ? order.orderNumber || orderId : "Order detail"}
        back={{ label: "Back to orders", to: hrefs.orders }}
        meta={order?.createdAt ?? purchase?.createdAt ? `Placed ${formatDateTime(order?.placedAt ?? order?.createdAt ?? purchase?.placedAt ?? purchase?.createdAt)}` : undefined}
        aside={order ? <StatusBadge status={order.status} /> : purchase ? <StatusBadge status={purchase.status} /> : undefined}
      />

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <Skeleton className="h-48 xl:col-span-8" />
          <Skeleton className="h-64 xl:col-span-4" />
        </div>
      ) : purchase && purchase.sourceType !== "storefront_order" ? (
        <PurchaseDetail purchase={purchase} />
      ) : !order ? (
        <EmptyState title={`Order ${orderId} was not found.`} description="Check the order number, or open your orders list to find it." />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
            <DataTable caption="Order items" className="xl:col-span-8">
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {(order.items ?? []).map((item: any) => {
                  const variantLabel = item.metadata?.optionSummary || item.metadata?.variantTitle || item.variantTitle || null;
                  const selections = item.metadata?.lineType === "bundle" && Array.isArray(item.metadata?.selections) ? item.metadata.selections : null;
                  return (
                    <tr key={item._id} className="border-t border-border">
                      <Td className="min-w-56">
                        <p className="font-semibold text-foreground">{item.productTitle}</p>
                        {variantLabel ? <p className="text-muted-foreground">{variantLabel}</p> : null}
                        {selections ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {selections.map((selection: any) => (
                              <Badge key={selection.componentId} tone="stock" className="normal-case tracking-normal">
                                {selection.productTitle}
                                {selection.quantity > 1 ? ` x${selection.quantity}` : ""}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        {item.metadata?.variantSku ? <p className="text-xs tabular-nums text-muted-foreground">SKU {item.metadata.variantSku}</p> : null}
                      </Td>
                      <Td align="right" className="text-muted-foreground">
                        {item.quantity}
                      </Td>
                      <Td align="right" className="whitespace-nowrap font-semibold text-foreground">
                        {recordedOrderMoney(item.lineTotalAmount, order.currencyCode)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>

            <StickyPanel label="Order summary" className="xl:col-span-4">
              <h2 className="text-lg font-semibold text-foreground">Summary</h2>
              <DataTable
                caption="Order summary"
                firstColumnLabel
                rows={[
                  { key: "status", cells: ["Status", <StatusBadge status={order.status} />] },
                  { key: "payment", cells: ["Payment", <StatusBadge status={order.paymentStatus} />] },
                  { key: "method", cells: ["Payment method", order.selectedPaymentMethodLabel || order.selectedPaymentMethodCode || "—"] },
                  { key: "fulfillment", cells: ["Fulfillment", <StatusBadge status={order.fulfillmentStatus} />] },
                  { key: "shipping", cells: ["Shipping method", order.selectedShippingMethodLabel || order.selectedShippingMethodCode || "Not recorded"] },
                  ...(carrierServiceLabel(order.shippingCarrierName, order.shippingServiceName) ? [{ key: "carrier", cells: ["Carrier service", carrierServiceLabel(order.shippingCarrierName, order.shippingServiceName)] }] : []),
                  ...orderAmountRows(order).map(row => ({ key: row.key, cells: [
                    <span className={row.key === "total" ? "font-semibold text-foreground" : undefined}>{row.label}</span>,
                    <span className={row.key === "total" ? "text-lg font-semibold tabular-nums text-foreground" : "tabular-nums"}>{row.value}</span>,
                  ] })),
                ]}
              />
            </StickyPanel>
          </div>

          <DashboardSection title="Shipments" count={order.shipments?.length || undefined}>
            {order.shipments?.length ? (
              <DataTable caption="Shipments">
                <thead>
                  <tr>
                    <Th>Shipment</Th>
                    <Th>Carrier</Th>
                    <Th>Tracking</Th>
                    <Th>Status</Th>
                    <Th>
                      <span className="sr-only">Links</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {order.shipments.map((shipment: any) => (
                    <tr key={shipment._id} className="border-t border-border">
                      <Td className="whitespace-nowrap font-semibold tabular-nums text-foreground">{shipment.shipmentNumber}</Td>
                      <Td className="text-muted-foreground">
                        {carrierServiceLabel(shipment.carrier, shipment.serviceName) || "Carrier pending"}
                      </Td>
                      <Td className="tabular-nums text-muted-foreground">
                        {shipment.trackingNumber || "—"}
                        {shipment.trackingStatus ? <span className="block text-xs">Provider status: {shipment.trackingStatus}</span> : null}
                      </Td>
                      <Td>
                        <StatusBadge status={shipment.status} />
                      </Td>
                      <Td align="right" className="whitespace-nowrap">
                        <span className="inline-flex gap-3">
                          {shipment.labelUrl ? (
                            <a href={shipment.labelUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                              Open label
                            </a>
                          ) : null}
                          {shipment.trackingUrl ? (
                            <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                              Track shipment
                            </a>
                          ) : null}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : (
              <Card className="px-3 py-2 text-[13px] text-muted-foreground">No shipment records yet.</Card>
            )}
          </DashboardSection>

          <DashboardSection
            title="Returns"
            action={
              eligibility?.isEligible ? (
                <Link to={hrefs.requestReturn} className={buttonClasses("primary", "sm")}>
                  Request return
                </Link>
              ) : null
            }
          >
            <Card className="flex flex-col gap-1 px-3 py-2 text-[13px] text-muted-foreground">
              <p>Request a return for eligible items and track existing RMAs.</p>
              {!eligibility ? (
                <p>Returns are unavailable for this order.</p>
              ) : eligibility.isEligible ? (
                <>
                  <p className="text-foreground">{eligibility.items.filter((item: any) => item.eligible).length} item(s) still have returnable quantity.</p>
                  {eligibility.returnWindowEndsAt ? <p>Eligible until {dateOrDash(eligibility.returnWindowEndsAt)}.</p> : null}
                </>
              ) : (
                <>
                  <p className="text-foreground">{eligibility.ineligibleReason}</p>
                  {eligibility.returnWindowEndsAt ? (
                    <p>
                      Policy window: {eligibility.returnWindowDays}-day return window ending {dateOrDash(eligibility.returnWindowEndsAt)}.
                    </p>
                  ) : null}
                </>
              )}
            </Card>

            {existingReturns?.length ? (
              <DataTable caption="Existing returns">
                <thead>
                  <tr>
                    <Th>Return</Th>
                    <Th>Submitted</Th>
                    <Th>Status</Th>
                    <Th>
                      <span className="sr-only">Details</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {existingReturns.map((ret: any) => (
                    <tr key={ret._id} className="border-t border-border">
                      <Td className="whitespace-nowrap font-semibold tabular-nums text-foreground">{ret.returnNumber}</Td>
                      <Td className="whitespace-nowrap text-muted-foreground">{dateOrDash(ret.createdAt)}</Td>
                      <Td>
                        <StatusBadge status={ret.status} />
                      </Td>
                      <Td align="right" className="whitespace-nowrap">
                        <Link to={hrefs.returnDetail(ret._id)} className="font-medium text-primary hover:underline">
                          View return details
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : null}
          </DashboardSection>
        </>
      )}
    </div>
  );
}

function PurchaseDetail({ purchase }: { purchase: any }) {
  return (
    <>
      <p className="text-[13px] text-muted-foreground">
        {PURCHASE_SOURCE_LABEL[purchase.sourceType] ?? purchase.sourceType}
        {purchase.sourceLabel ? ` · ${purchase.sourceLabel}` : ""}
      </p>
      <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
        {(purchase.lines ?? []).length ? (
          <DataTable caption="Purchase lines" className="xl:col-span-8">
            <thead>
              <tr>
                <Th>Item</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {purchase.lines.map((line: any) => (
                <tr key={line._id} className="border-t border-border">
                  <Td className="min-w-56">
                    <p className="font-semibold text-foreground">{line.title}</p>
                    {line.subtitle ? <p className="text-muted-foreground">{line.subtitle}</p> : null}
                  </Td>
                  <Td align="right" className="text-muted-foreground">
                    {line.quantity}
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-semibold text-foreground">
                    {recordedOrderMoney(line.lineTotalAmount, line.currencyCode)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <Card className="px-3 py-2 text-[13px] text-muted-foreground xl:col-span-8">No line items were captured for this order.</Card>
        )}

        <StickyPanel label="Purchase summary" className="xl:col-span-4">
          <h2 className="text-lg font-semibold text-foreground">Summary</h2>
          <DataTable
            caption="Purchase summary"
            firstColumnLabel
            rows={[
              { key: "status", cells: ["Status", <StatusBadge status={purchase.status} />] },
              { key: "payment", cells: ["Payment", <StatusBadge status={purchase.paymentStatus} />] },
              { key: "placed", cells: ["Placed", formatDateTime(purchase.placedAt ?? purchase.createdAt)] },
              { key: "paid", cells: ["Paid", formatDateTime(purchase.paidAt)] },
              ...orderAmountRows(purchase).map(row => ({ key: row.key, cells: [
                <span className={row.key === "total" ? "font-semibold text-foreground" : undefined}>{row.label}</span>,
                <span className={row.key === "total" ? "text-lg font-semibold tabular-nums text-foreground" : "tabular-nums"}>{row.value}</span>,
              ] })),
            ]}
          />
        </StickyPanel>
      </div>

      <DashboardSection title="Payments" count={purchase.payments?.length || undefined}>
        {(purchase.payments ?? []).length ? (
          <DataTable caption="Payments">
            <thead>
              <tr>
                <Th>Provider</Th>
                <Th>Status</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {purchase.payments.map((payment: any) => (
                <tr key={payment._id} className="border-t border-border">
                  <Td className="font-semibold text-foreground">{payment.provider}</Td>
                  <Td>
                    <StatusBadge status={payment.status} />
                    {payment.failureMessage ? <span className="ml-2 text-xs text-muted-foreground">{payment.failureMessage}</span> : null}
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-semibold text-foreground">
                    {recordedOrderMoney(payment.amount, payment.currencyCode)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <Card className="px-3 py-2 text-[13px] text-muted-foreground">No payment records yet.</Card>
        )}
      </DashboardSection>
    </>
  );
}
