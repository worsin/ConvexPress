import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convexpress-website/backend/generated/api";

import {
  getCartLineSku,
  getCartLineSubtitle,
  getCartLineTitle,
} from "@/components/commerce/cartLine";
import { MediaImage } from "@/components/media/MediaImage";
import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import { cn } from "@/lib/utils";

interface CartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CartDrawerCart =
  | {
      itemCount: number;
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
        };
        product?: {
          _id: string;
          slug: string;
          title: string;
          featuredMediaId?: string;
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

export function CartDrawer({ open, onOpenChange }: CartDrawerProps) {
  const settings = useSettings();
  const currencyCode = settings?.commerceConfig?.currencyCode || "USD";
  const commerceEnabled = settings?.plugins?.commerceEnabled === true;
  const { sessionToken, isReady } = useCommerceSessionToken();
  const cart = useQuery(
    (api as any).commerce.cart.getMine,
    commerceEnabled && isReady && sessionToken ? { sessionToken } : "skip",
  ) as CartDrawerCart;
  const updateItemQuantity = useMutation(api.commerce.cart.updateItemQuantity);
  const removeItem = useMutation(api.commerce.cart.removeItem);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function handleQuantity(itemId: string, quantity: number) {
    if (!sessionToken) return;
    setBusyAction(`quantity:${itemId}`);
    try {
      await updateItemQuantity({ sessionToken, cartItemId: itemId, quantity });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to update quantity",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRemove(itemId: string) {
    if (!sessionToken) return;
    setBusyAction(`remove:${itemId}`);
    try {
      await removeItem({ sessionToken, cartItemId: itemId });
      toast.success("Item removed");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to remove item",
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 data-closed:opacity-0 data-open:opacity-100"
        />
        <DialogPrimitive.Popup
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-[min(100vw,32rem)] flex-col bg-background shadow-2xl ring-1 ring-border transition-transform duration-300 focus:outline-none",
            "data-closed:translate-x-full data-open:translate-x-0",
          )}
        >
          <div className="flex min-h-16 items-center justify-between border-b border-border px-5">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
                Cart
              </DialogPrimitive.Title>
              <p className="text-xs text-muted-foreground">
                {cart?.itemCount
                  ? `${cart.itemCount} ${cart.itemCount === 1 ? "item" : "items"}`
                  : "Ready for products"}
              </p>
            </div>
            <DialogPrimitive.Close
              className="flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close cart"
            >
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!isReady || cart === undefined ? (
              <CartDrawerSkeleton />
            ) : !cart || cart.items.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center gap-4 px-8 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <ShoppingBag className="size-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Your cart is empty.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Add products from the catalog and review them here.
                  </p>
                </div>
                <Link
                  to="/shop"
                  onClick={() => onOpenChange(false)}
                  className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
                >
                  Shop products
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {cart.items.map((item) => (
                  <li key={item._id} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4 px-5 py-5">
                    <Link
                      to="/products/$slug"
                      params={{ slug: item.product?.slug ?? "" }}
                      onClick={() => onOpenChange(false)}
                      className="aspect-square overflow-hidden rounded-md bg-muted"
                    >
                      {(item.variant?.featuredMediaId ?? item.product?.featuredMediaId) ? (
                        <MediaImage
                          mediaId={(item.variant?.featuredMediaId ?? item.product?.featuredMediaId) as any}
                          alt={item.product?.title}
                          className="h-full w-full object-cover"
                          preferredSize="medium"
                          sizes="80px"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <ShoppingBag className="size-5" aria-hidden="true" />
                        </div>
                      )}
                    </Link>
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to="/products/$slug"
                            params={{ slug: item.product?.slug ?? "" }}
                            onClick={() => onOpenChange(false)}
                            className="line-clamp-2 text-sm font-semibold leading-5 text-foreground hover:text-primary"
                          >
                            {getCartLineTitle(item.product, item.metadata)}
                          </Link>
                          {getCartLineSubtitle(item.metadata) ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {getCartLineSubtitle(item.metadata)}
                            </p>
                          ) : null}
                          {getCartLineSku(item.product, item.metadata) ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              SKU {getCartLineSku(item.product, item.metadata)}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRemove(item._id)}
                          disabled={busyAction !== null}
                          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
                          aria-label="Remove item"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="inline-flex h-10 items-center rounded-md border border-border">
                          <button
                            type="button"
                            onClick={() => void handleQuantity(item._id, item.quantity - 1)}
                            disabled={busyAction !== null}
                            className="flex size-10 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="size-4" aria-hidden="true" />
                          </button>
                          <span className="min-w-10 text-center text-sm font-medium text-foreground">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleQuantity(item._id, item.quantity + 1)}
                            disabled={busyAction !== null}
                            className="flex size-10 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                            aria-label="Increase quantity"
                          >
                            <Plus className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                        <p className="text-sm font-semibold text-foreground">
                          {formatCurrency(item.lineTotalAmount, currencyCode)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-border bg-card px-5 py-5">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(cart?.subtotalAmount ?? 0, currencyCode)}
                </span>
              </div>
              {cart?.discountAmount ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium text-foreground">
                    -{formatCurrency(cart.discountAmount, currencyCode)}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-border pt-3 text-base">
                <span className="font-semibold text-foreground">Total</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(cart?.totalAmount ?? 0, currencyCode)}
                </span>
              </div>
            </div>
            <div className="mt-5 grid gap-3">
              <Link
                to="/checkout"
                onClick={() => onOpenChange(false)}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
                  (!cart || cart.items.length === 0) && "pointer-events-none opacity-50",
                )}
              >
                Checkout
              </Link>
              <Link
                to="/cart"
                onClick={() => onOpenChange(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                View full cart
              </Link>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CartDrawerSkeleton() {
  return (
    <div className="space-y-4 px-5 py-5">
      {[0, 1, 2].map((item) => (
        <div key={item} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4">
          <div className="aspect-square animate-pulse rounded-md bg-muted" />
          <div className="space-y-3">
            <div className="h-4 w-4/5 animate-pulse rounded-md bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded-md bg-muted" />
            <div className="h-10 w-36 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatCurrency(amount: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}
