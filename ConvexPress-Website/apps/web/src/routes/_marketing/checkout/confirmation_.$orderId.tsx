import { useQuery } from "convex/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";

export const Route = createFileRoute(
  "/_marketing/checkout/confirmation_/$orderId",
)({
  component: CheckoutConfirmationPage,
});

function CheckoutConfirmationPage() {
  const settings = useSettings();
  const { sessionToken, isReady } = useCommerceSessionToken();
  const { orderId } = Route.useParams();
  const order = useQuery(
    (api as any).commerce.orders.getByCheckoutSession,
    isReady && sessionToken
      ? {
          orderId: orderId as any,
          sessionToken,
        }
      : "skip",
  ) as any;

  if (order === undefined) {
    return (
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 py-10 lg:py-12">
        <div className="h-64 animate-pulse rounded-[2rem] bg-muted" />
      </div>
    );
  }

  if (!order) {
    return <NotFoundPage />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 py-10 lg:py-12">
      <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm lg:p-10">
        <h1 className="text-4xl font-semibold tracking-tight">Order confirmed</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Your order {order.orderNumber || orderId} has been created and is now
          in the system.
        </p>

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div className="rounded-2xl bg-muted/40 p-4">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="mt-1 font-medium text-foreground">{order.status}</dd>
          </div>
          <div className="rounded-2xl bg-muted/40 p-4">
            <dt className="text-muted-foreground">Total</dt>
            <dd className="mt-1 font-medium text-foreground">
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency:
                  settings?.commerceConfig?.currencyCode ||
                  order.currencyCode ||
                  "USD",
              }).format(order.totalAmount / 100)}
            </dd>
          </div>
          <div className="rounded-2xl bg-muted/40 p-4">
            <dt className="text-muted-foreground">Payment method</dt>
            <dd className="mt-1 font-medium text-foreground">
              {order.selectedPaymentMethodLabel ||
                order.selectedPaymentMethodCode ||
                "—"}
            </dd>
          </div>
          <div className="rounded-2xl bg-muted/40 p-4">
            <dt className="text-muted-foreground">Shipping method</dt>
            <dd className="mt-1 font-medium text-foreground">
              {order.selectedShippingMethodLabel ||
                order.selectedShippingMethodCode ||
                "Not required"}
            </dd>
          </div>
          {order.discountAmount > 0 ? (
            <div className="rounded-2xl bg-muted/40 p-4">
              <dt className="text-muted-foreground">
                Discount
                {order.appliedDiscountCode ? ` (${order.appliedDiscountCode})` : ""}
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                -
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency:
                    settings?.commerceConfig?.currencyCode ||
                    order.currencyCode ||
                    "USD",
                }).format(order.discountAmount / 100)}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/dashboard/orders/$orderId"
            params={{ orderId }}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
          >
            View order
          </Link>
          <Link
            to="/products"
            className="inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-medium text-foreground"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
