/**
 * Depot · checkout.confirmation — "order confirmed" as a card with a dense
 * table of the order facts and the same two actions as Core.
 */
import { CheckCircle2 } from "lucide-react";

import { formatMoney } from "@/lib/commerce/format";
import type { CheckoutConfirmationSurfaceData } from "@/templates/packs/core/surfaces/checkout.confirmation";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Card, Container, DataTable, Label, LinkButton, Skeleton } from "../parts";

export default function DepotCheckoutConfirmation({ data }: SurfaceProps<CheckoutConfirmationSurfaceData>) {
  const { orderId, order, currencyCode } = data;
  const money = (amount: number) => formatMoney(amount, currencyCode);

  return (
    <Container padded={false} data-slot="checkout-confirmation" className="flex flex-col gap-4 py-6 md:py-8">
      {order === undefined ? (
        <Skeleton className="h-64 max-w-3xl" />
      ) : (
        <Card className="flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CheckCircle2 className="size-5" aria-hidden="true" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <Label>Checkout complete</Label>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Order confirmed</h1>
              <p className="text-[13px] leading-5 text-muted-foreground">
                Your order <span className="font-semibold tabular-nums text-foreground">{order.orderNumber || orderId}</span> has been created and is now in the system.
              </p>
            </div>
          </div>

          <DataTable
            caption="Order details"
            firstColumnLabel
            rows={[
              { key: "status", cells: ["Status", <Badge tone="new">{order.status}</Badge>] },
              { key: "total", cells: ["Total", <span className="text-lg font-semibold tabular-nums text-foreground">{money(order.totalAmount)}</span>] },
              { key: "payment", cells: ["Payment method", order.selectedPaymentMethodLabel || order.selectedPaymentMethodCode || "—"] },
              { key: "shipping", cells: ["Shipping method", order.selectedShippingMethodLabel || order.selectedShippingMethodCode || "Not required"] },
              ...(order.discountAmount > 0 ? [{ key: "discount", cells: [`Discount${order.appliedDiscountCode ? ` (${order.appliedDiscountCode})` : ""}`, <span className="tabular-nums">-{money(order.discountAmount)}</span>] }] : []),
            ]}
          />

          <div className="flex flex-wrap gap-2">
            <LinkButton to="/dashboard/orders/$orderId" params={{ orderId }}>
              View order
            </LinkButton>
            <LinkButton to="/products" variant="secondary">
              Continue shopping
            </LinkButton>
          </div>
        </Card>
      )}
    </Container>
  );
}
