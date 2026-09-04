/** Core · cart — the full-page cart: line items, discount code, summary and sharing. */
import { Link } from "@tanstack/react-router";

import {
  getCartLineBundleSelections,
  getCartLineSku,
  getCartLineSubtitle,
  getCartLineTitle,
} from "@/components/commerce/cartLine";
import { MediaImage } from "@/components/media/MediaImage";
import { RelatedProducts } from "@/components/shop/RelatedProducts";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface CartSurfaceItem {
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
}

export interface CartSurfaceCart {
  itemCount: number;
  appliedDiscountCode?: string;
  appliedDiscountDescription?: string;
  discountAmount: number;
  subtotalAmount: number;
  totalAmount: number;
  items: CartSurfaceItem[];
}

export interface CartSurfaceData {
  /** False until the commerce session token is available (skeleton state). */
  isReady: boolean;
  /** `undefined` while loading, `null` when there is no cart yet. */
  cart: CartSurfaceCart | null | undefined;
  currencyCode: string;
  /** Which action is in flight: `quantity:<id>`, `remove:<id>`, `clear`, `discount`, or null. */
  busyAction: string | null;
  /** True while a share link is being created or revoked. */
  sharing: boolean;
  /** Draft discount code (persisted by the route so it can be cleared after applying). */
  discountCode: string;
  onDiscountCodeChange: (value: string) => void;
  actions: {
    updateQuantity: (itemId: string, quantity: number) => Promise<void>;
    remove: (itemId: string) => Promise<void>;
    clear: () => Promise<void>;
    applyDiscount: () => Promise<void>;
    removeDiscount: () => Promise<void>;
    enableSharing: () => Promise<void>;
    disableSharing: () => Promise<void>;
  };
}

export default function CoreCart({ data }: SurfaceProps<CartSurfaceData>) {
  const { isReady, cart, currencyCode, busyAction, sharing, discountCode, onDiscountCodeChange, actions } = data;
  const money = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amount / 100);

  return (
    <div className="flex w-full flex-col gap-8 py-6 lg:py-8">
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
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px] xl:items-start">
          <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm">
            <div className="divide-y divide-border">
              {cart.items.map((item) => (
                <div
                  key={item._id}
                  className="grid gap-5 p-5 sm:grid-cols-[120px_minmax(0,1fr)_160px]"
                >
                  <div className="aspect-square overflow-hidden rounded-2xl bg-muted/40">
                    {(item.variant?.featuredMediaId ?? item.product?.featuredMediaId) ? (
                      <MediaImage
                        mediaId={(item.variant?.featuredMediaId ?? item.product?.featuredMediaId) as any}
                        alt={item.product?.title}
                        className="h-full w-full object-cover"
                        preferredSize="medium"
                        sizes="120px"
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
                      Line total {money(item.lineTotalAmount)}
                    </p>
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void actions.updateQuantity(item._id, item.quantity - 1)}
                        disabled={busyAction !== null}
                        className="h-9 w-9 rounded-lg border border-border text-lg"
                      >
                        -
                      </button>
                      <div className="min-w-12 text-center text-sm font-medium">
                        {item.quantity}
                      </div>
                      <button
                        type="button"
                        onClick={() => void actions.updateQuantity(item._id, item.quantity + 1)}
                        disabled={busyAction !== null}
                        className="h-9 w-9 rounded-lg border border-border text-lg"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => void actions.remove(item._id)}
                        disabled={busyAction !== null}
                        className="ml-3 text-sm text-destructive hover:underline"
                      >
                        {busyAction === `remove:${item._id}` ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </div>
                  <div className="text-right text-sm font-medium text-foreground">
                    {money(item.lineTotalAmount)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-[2rem] border border-border bg-card p-6 shadow-sm xl:sticky xl:top-28">
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
                    onClick={() => void actions.removeDiscount()}
                    disabled={busyAction !== null}
                    className="inline-flex text-sm text-primary hover:underline"
                  >
                    {busyAction === "discount" ? "Removing..." : "Remove discount"}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    value={discountCode}
                    onChange={(event) => onDiscountCodeChange(event.target.value.toUpperCase())}
                    placeholder="Discount code"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void actions.applyDiscount()}
                    disabled={busyAction !== null || !discountCode.trim()}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground"
                  >
                    {busyAction === "discount" ? "Applying..." : "Apply discount"}
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
                <dd className="font-medium text-foreground">{money(cart.subtotalAmount)}</dd>
              </div>
              {cart.discountAmount > 0 ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">
                    Discount
                    {cart.appliedDiscountCode ? ` (${cart.appliedDiscountCode})` : ""}
                  </dt>
                  <dd className="font-medium text-foreground">
                    -{money(cart.discountAmount)}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-border pt-4 text-base">
                <dt className="font-semibold text-foreground">Total</dt>
                <dd className="font-semibold text-foreground">{money(cart.totalAmount)}</dd>
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
                onClick={() => void actions.clear()}
                disabled={busyAction !== null}
                className="inline-flex w-full items-center justify-center rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground"
              >
                {busyAction === "clear" ? "Clearing..." : "Clear cart"}
              </button>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void actions.enableSharing()}
                  disabled={sharing}
                  className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/60 disabled:opacity-50"
                >
                  Copy share link
                </button>
                <button
                  type="button"
                  onClick={() => void actions.disableSharing()}
                  disabled={sharing}
                  className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/60 disabled:opacity-50"
                >
                  Disable sharing
                </button>
              </div>
            </div>
            <div className="mt-6 border-t border-border pt-5">
              <RelatedProducts
                fromCart
                surface="cart_page"
                perGroup={2}
                limitGroups={2}
                layout="row"
                title="Goes with your cart"
                className="[&_h2]:text-base"
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
