/**
 * Journal · checkout.confirmation — the receipt's last page, centred in the
 * reading measure: eyebrow, "Order confirmed" in display type, the order
 * number in one sentence, the summary as rule-separated rows with the total
 * in display type, then "View order" and a quiet "Continue shopping".
 */
import { Link } from "@tanstack/react-router";

import { formatMoney } from "@/lib/commerce/format";
import type { CheckoutConfirmationSurfaceData } from "@/templates/packs/core/surfaces/checkout.confirmation";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, Eyebrow, LinkButton, Prose, SkeletonBlock, SkeletonText, buttonClasses } from "../parts";
import { ReceiptList, ReceiptRow, ReceiptTotal } from "../parts/extra-commerce";

export default function JournalCheckoutConfirmation({ data }: SurfaceProps<CheckoutConfirmationSurfaceData>) {
  const { orderId, order, currencyCode } = data;
  const money = (amount: number) => formatMoney(amount, currencyCode);

  if (order === undefined) {
    return (
      <Container data-slot="checkout-confirmation" className="py-14 md:py-20">
        <Prose className="flex flex-col items-center gap-6" aria-hidden="true">
          <SkeletonBlock className="h-3 w-24 rounded-full" />
          <SkeletonBlock className="h-12 w-2/3" />
          <SkeletonText lines={2} className="w-full" />
          <SkeletonBlock className="mt-6 h-48 w-full" />
        </Prose>
      </Container>
    );
  }

  return (
    <Container data-slot="checkout-confirmation" className="py-14 md:py-20">
      <Prose className="flex flex-col gap-10">
        <header className="flex flex-col items-center gap-5 text-center">
          <Eyebrow>Thank you</Eyebrow>
          <h1 className="font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-6xl">Order confirmed.</h1>
          <p className="max-w-[48ch] text-base leading-8 text-muted-foreground md:text-[17px]">
            Your order <span className="font-medium text-foreground">{order.orderNumber || orderId}</span> has been created and is now in the system.
          </p>
        </header>

        <ReceiptList>
          <ReceiptRow label="Order" value={order.orderNumber || orderId} />
          <ReceiptRow label="Status" value={<span className="capitalize">{String(order.status ?? "").replace(/_/g, " ")}</span>} />
          <ReceiptRow label="Payment method" value={order.selectedPaymentMethodLabel || order.selectedPaymentMethodCode || "—"} />
          <ReceiptRow label="Shipping method" value={order.selectedShippingMethodLabel || order.selectedShippingMethodCode || "Not required"} />
          {order.discountAmount > 0 ? <ReceiptRow label={`Discount${order.appliedDiscountCode ? ` (${order.appliedDiscountCode})` : ""}`} value={`-${money(order.discountAmount)}`} /> : null}
          <ReceiptTotal value={money(order.totalAmount)} />
        </ReceiptList>

        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          <LinkButton to="/dashboard/orders/$orderId" params={{ orderId }} variant="primary">
            View order
          </LinkButton>
          <Link to="/products" className={buttonClasses("link")}>
            Continue shopping
          </Link>
        </div>
      </Prose>
    </Container>
  );
}
