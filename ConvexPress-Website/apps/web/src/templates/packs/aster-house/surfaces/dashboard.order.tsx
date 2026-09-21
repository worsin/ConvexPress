/**
 * Aster · dashboard.order — one order, receipt style: the lines as
 * rule-separated rows on the left, the summary on the right with the total
 * in display type, then shipments, and the returns section (eligibility +
 * existing RMAs) under their own rules. A non-storefront purchase (form
 * order, subscription invoice, …) renders the purchase ledger view instead.
 */
import { orderAmountRows, carrierServiceLabel, recordedOrderMoney } from "@/lib/commerce/order-summary";
import { Link } from "@tanstack/react-router";

import type { DashboardOrderSurfaceData } from "@/templates/packs/core/surfaces/dashboard.order";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, EmptyState, LinkButton, SkeletonBlock, SmallCaps } from "../parts";
import { ReceiptList, ReceiptRow, ReceiptTotal } from "../parts/extra-commerce";
import { BackLink, PageHeading, Row, RowList, Section, StatusPill, dashDate, dashDateTime, textActionClasses } from "../parts/extra-dashboard";

const PURCHASE_SOURCE_LABEL: Record<string, string> = {
  storefront_order: "Storefront order",
  form_order: "Form order",
  subscription_signup: "Subscription signup",
  subscription_invoice: "Subscription invoice",
  manual: "Manual order",
  api: "Order",
};

export default function AsterDashboardOrder({ data }: SurfaceProps<DashboardOrderSurfaceData>) {
  const { orderId, purchase, order, eligibility, existingReturns, hrefs } = data;

  const loading = purchase === undefined || (!(purchase && purchase.sourceType !== "storefront_order") && order === undefined);
  const isPurchase = Boolean(purchase && purchase.sourceType !== "storefront_order");
  const number = isPurchase ? purchase.orderNumber || purchase._id : order?.orderNumber || orderId;

  return (
    <div data-slot="dashboard-order" className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <BackLink to={hrefs.orders}>Back to orders</BackLink>
        <PageHeading eyebrow="Order" title={loading ? "Order detail" : number} />
      </div>

      {loading ? (
        <OrderSkeleton />
      ) : isPurchase ? (
        <PurchaseDetail purchase={purchase} />
      ) : !order ? (
        <EmptyState eyebrow="Not found" title={`Order ${orderId} was not found.`} />
      ) : (
        <div className="flex flex-col gap-10">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12 lg:items-start">
            {/* Lines */}
            <RowList aria-label="Order items">
              {(order.items ?? []).map((item: any) => {
                const variantLabel = item.metadata?.optionSummary || item.metadata?.variantTitle || item.variantTitle || null;
                return (
                  <Row key={item._id} className="flex-row items-start justify-between gap-6">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <p className="font-display text-xl leading-snug text-foreground">{item.productTitle}</p>
                      {variantLabel ? <p className="text-sm text-muted-foreground">{variantLabel}</p> : null}
                      <SmallCaps className="tabular-nums">Quantity {item.quantity}</SmallCaps>
                      {item.metadata?.lineType === "bundle" && Array.isArray(item.metadata?.selections) ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {item.metadata.selections.map((selection: any) => (
                            <Badge key={selection.componentId} className="normal-case tracking-normal">
                              {selection.productTitle}
                              {selection.quantity > 1 ? ` ×${selection.quantity}` : ""}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      {item.metadata?.variantSku ? <SmallCaps>SKU {item.metadata.variantSku}</SmallCaps> : null}
                    </div>
                    <p className="shrink-0 font-display text-lg tabular-nums text-foreground">{recordedOrderMoney(item.lineTotalAmount, order.currencyCode)}</p>
                  </Row>
                );
              })}
            </RowList>

            {/* Summary */}
            <aside className="flex flex-col gap-4" aria-label="Order summary">
              <SmallCaps as="h2">Summary</SmallCaps>
              <ReceiptList>
                <ReceiptRow label="Status" value={<StatusPill status={order.status} />} />
                <ReceiptRow label="Payment" value={<span className="capitalize">{String(order.paymentStatus ?? "").replace(/_/g, " ")}</span>} />
                <ReceiptRow label="Payment method" value={order.selectedPaymentMethodLabel || order.selectedPaymentMethodCode || "—"} />
                <ReceiptRow label="Fulfillment" value={<span className="capitalize">{String(order.fulfillmentStatus ?? "").replace(/_/g, " ")}</span>} />
                <ReceiptRow label="Shipping method" value={order.selectedShippingMethodLabel || order.selectedShippingMethodCode || "Not recorded"} />
                {carrierServiceLabel(order.shippingCarrierName, order.shippingServiceName) ? <ReceiptRow label="Carrier service" value={carrierServiceLabel(order.shippingCarrierName, order.shippingServiceName)} /> : null}
                {orderAmountRows(order).map(row => row.key === "total"
                  ? <ReceiptTotal key={row.key} value={row.value} />
                  : <ReceiptRow key={row.key} label={row.label} value={row.value} />)}
              </ReceiptList>
            </aside>
          </div>

          {/* Shipments */}
          <Section title="Shipments">
            {order.shipments?.length ? (
              <RowList>
                {order.shipments.map((shipment: any) => (
                  <Row key={shipment._id}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="text-base font-medium text-foreground">{shipment.shipmentNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {carrierServiceLabel(shipment.carrier, shipment.serviceName) || "Carrier pending"}
                          {shipment.trackingNumber ? ` • ${shipment.trackingNumber}` : ""}
                        </p>
                        {shipment.trackingStatus ? <p className="text-xs text-muted-foreground">Provider status: {shipment.trackingStatus}</p> : null}
                      </div>
                      <StatusPill status={shipment.status} />
                    </div>
                    {shipment.labelUrl || shipment.trackingUrl ? (
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {shipment.labelUrl ? (
                          <a href={shipment.labelUrl} target="_blank" rel="noreferrer" className={textActionClasses("primary")}>
                            Open label
                          </a>
                        ) : null}
                        {shipment.trackingUrl ? (
                          <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" className={textActionClasses("primary")}>
                            Track shipment
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </Row>
                ))}
              </RowList>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">No shipment records yet.</p>
            )}
          </Section>

          {/* Returns */}
          <Section
            title="Returns"
            lede="Request a return for eligible items and track existing RMAs."
            action={
              eligibility?.isEligible ? (
                <LinkButton to={hrefs.requestReturn} variant="primary" className="h-10 px-5">
                  Request return
                </LinkButton>
              ) : null
            }
          >
            {!eligibility ? (
              <p className="text-sm leading-6 text-muted-foreground">Returns are unavailable for this order.</p>
            ) : eligibility.isEligible ? (
              <div className="flex flex-col gap-1 text-sm leading-6 text-muted-foreground">
                <p>{eligibility.items.filter((item: any) => item.eligible).length} item(s) still have returnable quantity.</p>
                {eligibility.returnWindowEndsAt ? <p>Eligible until {dashDate(eligibility.returnWindowEndsAt)}.</p> : null}
              </div>
            ) : (
              <div className="flex flex-col gap-1 text-sm leading-6 text-muted-foreground">
                <p>{eligibility.ineligibleReason}</p>
                {eligibility.returnWindowEndsAt ? (
                  <p>
                    Policy window: {eligibility.returnWindowDays}-day return window ending {dashDate(eligibility.returnWindowEndsAt)}.
                  </p>
                ) : null}
              </div>
            )}

            {existingReturns?.length ? (
              <RowList>
                {existingReturns.map((ret: any) => (
                  <Row key={ret._id} className="flex-row flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-base font-medium text-foreground">{ret.returnNumber}</p>
                      <SmallCaps>Submitted {dashDate(ret.createdAt)}</SmallCaps>
                    </div>
                    <div className="flex items-center gap-5">
                      <StatusPill status={ret.status} />
                      <Link to={hrefs.returnDetail(ret._id) as any} className={textActionClasses("primary")}>
                        View return details
                      </Link>
                    </div>
                  </Row>
                ))}
              </RowList>
            ) : null}
          </Section>
        </div>
      )}
    </div>
  );
}

function PurchaseDetail({ purchase }: { purchase: any }) {
  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12 lg:items-start">
        <div className="flex flex-col gap-4">
          <SmallCaps as="h2">
            {PURCHASE_SOURCE_LABEL[purchase.sourceType] ?? purchase.sourceType}
            {purchase.sourceLabel ? ` · ${purchase.sourceLabel}` : ""}
          </SmallCaps>
          {(purchase.lines ?? []).length ? (
            <RowList aria-label="Order lines">
              {purchase.lines.map((line: any) => (
                <Row key={line._id} className="flex-row items-start justify-between gap-6">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <p className="font-display text-xl leading-snug text-foreground">{line.title}</p>
                    {line.subtitle ? <p className="text-sm text-muted-foreground">{line.subtitle}</p> : null}
                    <SmallCaps className="tabular-nums">Quantity {line.quantity}</SmallCaps>
                  </div>
                  <p className="shrink-0 font-display text-lg tabular-nums text-foreground">{recordedOrderMoney(line.lineTotalAmount, line.currencyCode)}</p>
                </Row>
              ))}
            </RowList>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">No line items were captured for this order.</p>
          )}
        </div>

        <aside className="flex flex-col gap-4" aria-label="Order summary">
          <SmallCaps as="h2">Summary</SmallCaps>
          <ReceiptList>
            <ReceiptRow label="Status" value={<StatusPill status={purchase.status} />} />
            <ReceiptRow label="Payment" value={<span className="capitalize">{String(purchase.paymentStatus ?? "").replace(/_/g, " ")}</span>} />
            <ReceiptRow label="Placed" value={dashDateTime(purchase.placedAt ?? purchase.createdAt)} />
            <ReceiptRow label="Paid" value={dashDateTime(purchase.paidAt)} />
            {orderAmountRows(purchase).map(row => row.key === "total"
              ? <ReceiptTotal key={row.key} value={row.value} />
              : <ReceiptRow key={row.key} label={row.label} value={row.value} />)}
          </ReceiptList>
        </aside>
      </div>

      <Section title="Payments">
        {(purchase.payments ?? []).length ? (
          <RowList>
            {purchase.payments.map((payment: any) => (
              <Row key={payment._id} className="flex-row flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-base font-medium capitalize text-foreground">{payment.provider}</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="capitalize">{String(payment.status ?? "").replace(/_/g, " ")}</span>
                    {payment.failureMessage ? ` · ${payment.failureMessage}` : ""}
                  </p>
                </div>
                <p className="font-display text-lg tabular-nums text-foreground">{recordedOrderMoney(payment.amount, payment.currencyCode)}</p>
              </Row>
            ))}
          </RowList>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">No payment records yet.</p>
        )}
      </Section>
    </div>
  );
}

function OrderSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12" role="status" aria-label="Loading">
      <div className="flex flex-col divide-y divide-border border-y border-border" aria-hidden="true">
        {[0, 1].map((index) => (
          <div key={index} className="flex items-start justify-between gap-6 py-5">
            <div className="flex flex-1 flex-col gap-2.5">
              <SkeletonBlock className="h-6 w-1/2" />
              <SkeletonBlock className="h-3 w-1/4 rounded-full" />
            </div>
            <SkeletonBlock className="h-6 w-16" />
          </div>
        ))}
      </div>
      <SkeletonBlock className="h-56" aria-hidden="true" />
    </div>
  );
}
