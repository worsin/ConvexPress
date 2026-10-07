/**
 * Journal · cart — receipt style. Two columns: the lines as rule-separated
 * rows on the left; on the right the discount code (one underline input), the
 * summary with the total in display type, checkout, and sharing.
 *
 * Every action comes in through `data.actions`, exactly as Core receives it.
 */
import { Link } from "@tanstack/react-router";
import { Minus, Plus } from "lucide-react";

import { getCartLineBundleSelections, getCartLineSku, getCartLineSubtitle, getCartLineTitle } from "@/components/commerce/cartLine";
import { MediaImage } from "@/components/media/MediaImage";
import { RelatedProducts } from "@/components/shop/RelatedProducts";
import { formatMoney } from "@/lib/commerce/format";
import type { CartSurfaceData, CartSurfaceItem } from "@/templates/packs/core/surfaces/cart";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Button, Container, EmptyState, LinkButton, Rule, SectionHeading, SkeletonBlock, SmallCaps, UnderlineInput } from "../parts";

export default function JournalCart({ data }: SurfaceProps<CartSurfaceData>) {
  const { isReady, cart, currencyCode, busyAction, sharing, discountCode, onDiscountCodeChange, actions } = data;
  const money = (amount: number) => formatMoney(amount, currencyCode);
  const busy = busyAction !== null;

  return (
    <Container data-slot="cart-page" className="flex flex-col gap-10 py-6 md:gap-14 md:py-10">
      <SectionHeading level={1} eyebrow="Your order" title="Cart" lede="Review your items, adjust quantities, and continue into checkout." />

      {!isReady || cart === undefined ? (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16" aria-hidden="true">
          <div className="flex flex-col divide-y divide-border border-y border-border">
            {[0, 1].map((item) => (
              <div key={item} className="grid grid-cols-[5rem_minmax(0,1fr)_auto] gap-5 py-6">
                <SkeletonBlock className="aspect-[4/5]" />
                <div className="flex flex-col gap-3">
                  <SkeletonBlock className="h-5 w-2/3" />
                  <SkeletonBlock className="h-3 w-1/3 rounded-full" />
                </div>
                <SkeletonBlock className="h-5 w-16" />
              </div>
            ))}
          </div>
          <SkeletonBlock className="h-64" />
        </div>
      ) : !cart || cart.items.length === 0 ? (
        <EmptyState
          eyebrow="Empty"
          title="Your cart is empty."
          action={
            <LinkButton to="/products" variant="primary">
              Browse products
            </LinkButton>
          }
        />
      ) : (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16 lg:items-start">
          {/* Lines */}
          <ul className="flex flex-col divide-y divide-border border-y border-border" aria-label="Cart items">
            {cart.items.map((item) => (
              <Line key={item._id} item={item} money={money} busy={busy} busyAction={busyAction} actions={actions} />
            ))}
          </ul>

          {/* Summary */}
          <aside className="flex flex-col gap-8 lg:sticky lg:top-28" aria-label="Order summary">
            <div className="flex flex-col gap-3">
              <SmallCaps as="h2">Discount</SmallCaps>
              {cart.appliedDiscountCode ? (
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-foreground">
                    Code <span className="font-medium">{cart.appliedDiscountCode}</span> applied
                  </p>
                  <p className="text-xs text-muted-foreground">{cart.appliedDiscountDescription || "Discount applied to cart"}</p>
                  <button type="button" onClick={() => void actions.removeDiscount()} disabled={busy} className="self-start text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground disabled:opacity-50">
                    {busyAction === "discount" ? "Removing..." : "Remove discount"}
                  </button>
                </div>
              ) : (
                <form
                  className="flex items-end gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void actions.applyDiscount();
                  }}
                >
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Discount code</span>
                    <UnderlineInput value={discountCode} onChange={(event) => onDiscountCodeChange(event.target.value.toUpperCase())} placeholder="Discount code" className="h-10 text-sm uppercase" />
                  </label>
                  <button type="submit" disabled={busy || !discountCode.trim()} className="h-10 shrink-0 text-sm font-medium text-foreground underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground disabled:opacity-50">
                    {busyAction === "discount" ? "Applying..." : "Apply"}
                  </button>
                </form>
              )}
            </div>

            <dl className="flex flex-col divide-y divide-border border-y border-border text-sm">
              <div className="flex items-center justify-between py-3">
                <dt className="text-muted-foreground">Items</dt>
                <dd className="tabular-nums text-foreground">{cart.itemCount}</dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums text-foreground">{money(cart.subtotalAmount)}</dd>
              </div>
              {cart.discountAmount > 0 ? (
                <div className="flex items-center justify-between py-3">
                  <dt className="text-muted-foreground">Discount{cart.appliedDiscountCode ? ` (${cart.appliedDiscountCode})` : ""}</dt>
                  <dd className="tabular-nums text-foreground">-{money(cart.discountAmount)}</dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between py-4">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">Total</dt>
                <dd className="font-display text-2xl tabular-nums text-foreground md:text-3xl">{money(cart.totalAmount)}</dd>
              </div>
            </dl>

            <div className="flex flex-col gap-3">
              <LinkButton to="/checkout" variant="primary" className="w-full">
                Continue to checkout
              </LinkButton>
              <Button variant="ghost" onClick={() => void actions.clear()} disabled={busy} className="w-full">
                {busyAction === "clear" ? "Clearing..." : "Clear cart"}
              </Button>
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-1">
                <button type="button" onClick={() => void actions.enableSharing()} disabled={sharing} className="text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground disabled:opacity-50">
                  Copy share link
                </button>
                <button type="button" onClick={() => void actions.disableSharing()} disabled={sharing} className="text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground disabled:opacity-50">
                  Disable sharing
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <Rule />
              <RelatedProducts fromCart surface="cart_page" perGroup={2} limitGroups={2} layout="row" title="Goes with your cart" className="[&_h2]:font-display [&_h2]:text-xl [&_h2]:font-normal" />
            </div>
          </aside>
        </div>
      )}
    </Container>
  );
}

function Line({
  item,
  money,
  busy,
  busyAction,
  actions,
}: {
  item: CartSurfaceItem;
  money: (amount: number) => string;
  busy: boolean;
  busyAction: string | null;
  actions: CartSurfaceData["actions"];
}) {
  const mediaId = item.variant?.featuredMediaId ?? item.product?.featuredMediaId;
  const title = getCartLineTitle(item.product, item.metadata);
  const subtitle = getCartLineSubtitle(item.metadata, item.variant);
  const sku = getCartLineSku(item.product, item.metadata, item.variant);
  const isBundle = item.metadata?.lineType === "bundle";
  return (
    <li className="grid grid-cols-[5rem_minmax(0,1fr)] gap-5 py-6 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:gap-6">
      <div className="overflow-hidden rounded-xl bg-muted">
        <div className="aspect-[4/5]">{mediaId ? <MediaImage mediaId={mediaId as any} alt={item.product?.title} className="h-full w-full object-cover" preferredSize="medium" sizes="96px" /> : null}</div>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {isBundle ? (
          <p className="font-display text-xl leading-snug text-foreground">{title}</p>
        ) : (
          <Link to="/products/$slug" params={{ slug: item.product?.slug ?? "" }} className="font-display text-xl leading-snug text-foreground transition-colors hover:text-primary">
            {title}
          </Link>
        )}
        {isBundle ? (
          <div className="flex flex-wrap gap-1.5">
            {getCartLineBundleSelections(item.metadata).map((selection) => (
              <Badge key={selection.componentId} className="normal-case tracking-normal">
                {selection.productTitle}
                {selection.quantity > 1 ? ` ×${selection.quantity}` : ""}
              </Badge>
            ))}
          </div>
        ) : null}
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        {sku ? <SmallCaps>SKU {sku}</SmallCaps> : null}
        <p className="text-sm tabular-nums text-muted-foreground sm:hidden">{money(item.lineTotalAmount)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <div className="inline-flex h-9 items-center rounded-full border border-border" role="group" aria-label={`${title} quantity`}>
            <button type="button" onClick={() => void actions.updateQuantity(item._id, item.quantity - 1)} disabled={busy} aria-label={`Decrease ${title}`} className="flex h-full w-9 items-center justify-center rounded-l-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
              <Minus className="size-3.5" aria-hidden="true" />
            </button>
            <span className="min-w-7 text-center text-sm font-semibold tabular-nums text-foreground">{item.quantity}</span>
            <button type="button" onClick={() => void actions.updateQuantity(item._id, item.quantity + 1)} disabled={busy} aria-label={`Increase ${title}`} className="flex h-full w-9 items-center justify-center rounded-r-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
              <Plus className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <button type="button" onClick={() => void actions.remove(item._id)} disabled={busy} className="text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-destructive disabled:opacity-50">
            {busyAction === `remove:${item._id}` ? "Removing..." : "Remove"}
          </button>
        </div>
      </div>
      <p className="hidden text-right font-display text-lg tabular-nums text-foreground sm:block">{money(item.lineTotalAmount)}</p>
    </li>
  );
}
