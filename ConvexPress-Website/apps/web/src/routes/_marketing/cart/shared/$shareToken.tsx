import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";

import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import {
  getCartLineBundleSelections,
  getCartLineTitle,
} from "@/components/commerce/cartLine";

export const Route = createFileRoute("/_marketing/cart/shared/$shareToken")({
  component: SharedCartPage,
});

function formatMoney(amount: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

function SharedCartPage() {
  const { shareToken } = Route.useParams();
  const router = useRouter();
  const { sessionToken, isReady } = useCommerceSessionToken();
  const sharedCart = useQuery((api as any).commerce.cart.getShared, {
    shareToken,
  }) as any;
  const copyShared = useMutation((api as any).commerce.cart.copyShared);
  const [isCopying, setIsCopying] = useState(false);

  async function handleCopyCart() {
    if (!isReady || !sessionToken) return;
    setIsCopying(true);
    try {
      await copyShared({ shareToken, sessionToken });
      toast.success("Shared cart copied");
      router.navigate({ to: "/cart" });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to copy shared cart",
      );
    } finally {
      setIsCopying(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 py-12">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Shared cart</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Review these items and copy them into your cart when you are ready.
        </p>
      </div>

      {sharedCart === undefined ? (
        <div className="h-48 animate-pulse rounded-[2rem] bg-muted" />
      ) : !sharedCart ? (
        <div className="rounded-[2rem] border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            This shared cart is no longer available.
          </p>
          <Link
            to="/products"
            className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm">
            <div className="divide-y divide-border">
              {sharedCart.items.map((item: any) => (
                <div key={item._id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-foreground">
                        {getCartLineTitle(item.product, item.metadata)}
                      </p>
                      {item.metadata?.lineType === "bundle" ? (
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
                    <div className="text-right text-sm">
                      <p className="font-medium text-foreground">
                        {formatMoney(
                          item.lineTotalAmount,
                          sharedCart.currencyCode,
                        )}
                      </p>
                      <p className="text-muted-foreground">
                        Qty {item.quantity}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Summary</h2>
            <dl className="mt-6 space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Items</dt>
                <dd className="font-medium text-foreground">
                  {sharedCart.itemCount}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-medium text-foreground">
                  {formatMoney(sharedCart.subtotalAmount, sharedCart.currencyCode)}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-4 text-base">
                <dt className="font-semibold text-foreground">Total</dt>
                <dd className="font-semibold text-foreground">
                  {formatMoney(sharedCart.totalAmount, sharedCart.currencyCode)}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => void handleCopyCart()}
              disabled={!isReady || isCopying}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {isCopying ? "Copying..." : "Copy to my cart"}
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
