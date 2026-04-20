import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";

import { MediaImage } from "@/components/media/MediaImage";
import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import {
  getCartLineBundleSelections,
  getCartLineSku,
  getCartLineSubtitle,
  getCartLineTitle,
} from "@/components/commerce/cartLine";

export const Route = createFileRoute("/_marketing/cart")({
  component: CartPage,
});

function CartPage() {
  const settings = useSettings();
  const commerceEnabled = settings?.plugins?.commerceEnabled === true;
  const currencyCode = settings?.commerceConfig?.currencyCode || "USD";
  const { sessionToken, isReady } = useCommerceSessionToken();
  const cart = useQuery(
    api.commerce.cart.getMine,
    commerceEnabled && isReady && sessionToken ? { sessionToken } : "skip",
  ) as
    | {
        itemCount: number;
        appliedDiscountCode?: string;
        appliedDiscountDescription?: string;
        discountAmount: number;
        subtotalAmount: number;
        totalAmount: number;
        items: Array<{
          _id: string;
          quantity: number;
          lineTotalAmount: number;
          metadata?: {
            lineType?: string;
            bundleName?: string;
            variantTitle?: string;
            optionSummary?: string;
            variantSku?: string;
            selections?: Array<{
              componentId: string;
              componentLabel?: string;
              productTitle: string;
              quantity: number;
            }>;
          };
          product?: {
            _id: string;
            slug: string;
            title: string;
            featuredMediaId?: string;
            stockQuantity?: number;
            sku?: string;
          } | null;
          variant?: {
            _id: string;
            featuredMediaId?: string;
          } | null;
        }>;
      }
    | null
    | undefined;
  const updateItemQuantity = useMutation(api.commerce.cart.updateItemQuantity);
  const removeItem = useMutation(api.commerce.cart.removeItem);
  const clearCart = useMutation(api.commerce.cart.clear);
  const applyDiscountCode = useMutation(api.commerce.cart.applyDiscountCode);
  const removeDiscountCode = useMutation(api.commerce.cart.removeDiscountCode);
  const [discountCode, setDiscountCode] = useState("");

  async function handleQuantity(itemId: string, quantity: number) {
    if (!sessionToken) return;
    try {
      await updateItemQuantity({ sessionToken, cartItemId: itemId, quantity });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to update quantity",
      );
    }
  }

  async function handleRemove(itemId: string) {
    if (!sessionToken) return;
    try {
      await removeItem({ sessionToken, cartItemId: itemId });
      toast.success("Item removed");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to remove item",
      );
    }
  }

  async function handleClear() {
    if (!sessionToken) return;
    try {
      await clearCart({ sessionToken });
      toast.success("Cart cleared");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to clear cart",
      );
    }
  }

  async function handleApplyDiscount() {
    if (!sessionToken || !discountCode.trim()) return;
    try {
      await applyDiscountCode({
        sessionToken,
        code: discountCode.trim(),
      });
      setDiscountCode("");
      toast.success("Discount applied");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to apply discount",
      );
    }
  }

  async function handleRemoveDiscount() {
    if (!sessionToken) return;
    try {
      await removeDiscountCode({ sessionToken });
      toast.success("Discount removed");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to remove discount",
      );
    }
  }

  return (
    <PublicPluginGate pluginId="commerce">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 py-12">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">Cart</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Review cart items, adjust quantities, and continue into checkout.
          </p>
        </div>

        {!isReady || cart === undefined ? (
          <div className="h-48 animate-pulse rounded-[2rem] bg-muted" />
        ) : !cart || cart.items.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">Your cart is empty.</p>
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
                {cart.items.map((item) => (
                  <div
                    key={item._id}
                    className="grid gap-4 p-5 sm:grid-cols-[96px_minmax(0,1fr)_120px]"
                  >
                    <div className="aspect-square overflow-hidden rounded-2xl bg-muted/40">
                      {(item.variant?.featuredMediaId ?? item.product?.featuredMediaId) ? (
                        <MediaImage
                          mediaId={(item.variant?.featuredMediaId ?? item.product?.featuredMediaId) as any}
                          alt={item.product?.title}
                          className="h-full w-full object-cover"
                          preferredSize="medium"
                          sizes="96px"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      {item.metadata?.lineType === "bundle" ? (
                        <div>
                          <p className="text-lg font-semibold text-foreground">
                            {getCartLineTitle(item.product, item.metadata)}
                          </p>
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
                        </div>
                      ) : (
                        <div>
                          <Link
                            to="/products/$slug"
                            params={{ slug: item.product?.slug ?? "" }}
                            className="text-lg font-semibold text-foreground hover:text-primary"
                          >
                            {getCartLineTitle(item.product, item.metadata)}
                          </Link>
                          {getCartLineSubtitle(item.metadata) ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {getCartLineSubtitle(item.metadata)}
                            </p>
                          ) : null}
                          {getCartLineSku(item.product, item.metadata) ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              SKU {getCartLineSku(item.product, item.metadata)}
                            </p>
                          ) : null}
                        </div>
                      )}
                      <p className="mt-2 text-sm text-muted-foreground">
                        Line total{" "}
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: currencyCode,
                        }).format(item.lineTotalAmount / 100)}
                      </p>
                      <div className="mt-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleQuantity(item._id, item.quantity - 1)}
                          className="h-9 w-9 rounded-lg border border-border text-lg"
                        >
                          -
                        </button>
                        <div className="min-w-12 text-center text-sm font-medium">
                          {item.quantity}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleQuantity(item._id, item.quantity + 1)}
                          className="h-9 w-9 rounded-lg border border-border text-lg"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemove(item._id)}
                          className="ml-3 text-sm text-destructive hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="text-right text-sm font-medium text-foreground">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: currencyCode,
                      }).format(item.lineTotalAmount / 100)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Summary</h2>
              <div className="mt-4 space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
                {cart.appliedDiscountCode ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Applied code: {cart.appliedDiscountCode}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cart.appliedDiscountDescription || "Discount applied to cart"}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleRemoveDiscount()}
                      className="inline-flex text-sm text-primary hover:underline"
                    >
                      Remove discount
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <input
                      value={discountCode}
                      onChange={(event) => setDiscountCode(event.target.value.toUpperCase())}
                      placeholder="Discount code"
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void handleApplyDiscount()}
                      className="inline-flex w-full items-center justify-center rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground"
                    >
                      Apply discount
                    </button>
                  </div>
                )}
              </div>
              <dl className="mt-6 space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Items</dt>
                  <dd className="font-medium text-foreground">{cart.itemCount}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="font-medium text-foreground">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: currencyCode,
                    }).format(cart.subtotalAmount / 100)}
                  </dd>
                </div>
                {cart.discountAmount > 0 ? (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">
                      Discount
                      {cart.appliedDiscountCode ? ` (${cart.appliedDiscountCode})` : ""}
                    </dt>
                    <dd className="font-medium text-foreground">
                      -
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: currencyCode,
                      }).format(cart.discountAmount / 100)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between border-t border-border pt-4 text-base">
                  <dt className="font-semibold text-foreground">Total</dt>
                  <dd className="font-semibold text-foreground">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: currencyCode,
                    }).format(cart.totalAmount / 100)}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 space-y-3">
                <Link
                  to="/checkout"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
                >
                  Continue to checkout
                </Link>
                <button
                  type="button"
                  onClick={() => void handleClear()}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground"
                >
                  Clear cart
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </PublicPluginGate>
  );
}
