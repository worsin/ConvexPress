/**
 * Aster · chrome.cartDrawer — the receipt in a side panel. Lines as
 * rule-separated rows with a stepper pill and a quiet "Remove" link; the
 * total in display type; Checkout as the one pill. Same behaviour as Core:
 * quantity and removal through the shared cart hook, the free-shipping line
 * and drawer recommendations from the assistant settings, links close the
 * panel.
 */
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Link } from "@tanstack/react-router";
import { Minus, Plus, X } from "lucide-react";

import { getCartLineBundleSelections, getCartLineSku, getCartLineSubtitle, getCartLineTitle } from "@/components/commerce/cartLine";
import { MediaImage } from "@/components/media/MediaImage";
import { RelatedProducts } from "@/components/shop/RelatedProducts";
import { useAssistantConfig } from "@/hooks/useAssistantConfig";
import { useCartLines, type CartLine } from "@/hooks/useCartLines";
import { formatMoney } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";
import type { CartDrawerSurfaceData } from "@/templates/packs/core/surfaces/chrome.cartDrawer";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, SkeletonBlock, SmallCaps, buttonClasses } from "../parts";

export default function AsterChromeCartDrawer({ data }: SurfaceProps<CartDrawerSurfaceData>) {
  const { open, onOpenChange } = data;
  const { currencyCode, isReady, cart, busyAction, updateQuantity, remove } = useCartLines();
  const assistant = useAssistantConfig();
  const money = (amount: number) => formatMoney(amount, currencyCode);
  const close = () => onOpenChange(false);
  const hasItems = !!cart && cart.items.length > 0;

  const threshold = assistant.freeShippingThresholdMinor;
  const subtotal = cart?.subtotalAmount ?? 0;
  const remaining = threshold > 0 ? Math.max(0, threshold - subtotal) : 0;
  const progress = threshold > 0 ? Math.min(100, (subtotal / threshold) * 100) : 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px] transition-opacity duration-200 data-closed:opacity-0 data-open:opacity-100" />
        <DialogPrimitive.Popup
          data-slot="cart-drawer"
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-[min(100vw,30rem)] flex-col border-l border-border bg-background transition-transform duration-300 focus:outline-none",
            "data-closed:translate-x-full data-open:translate-x-0",
          )}
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
            <div className="flex items-baseline gap-3">
              <DialogPrimitive.Title className="font-display text-xl tracking-tight text-foreground">Cart</DialogPrimitive.Title>
              <SmallCaps className="tabular-nums">{cart?.itemCount ? `${cart.itemCount} ${cart.itemCount === 1 ? "item" : "items"}` : "Empty"}</SmallCaps>
            </div>
            <DialogPrimitive.Close className="-mr-2 flex size-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground" aria-label="Close cart">
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!isReady || cart === undefined ? (
              <div className="flex flex-col divide-y divide-border px-6" aria-hidden="true">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 py-5">
                    <SkeletonBlock className="aspect-[4/5]" />
                    <div className="flex flex-col gap-3">
                      <SkeletonBlock className="h-4 w-4/5" />
                      <SkeletonBlock className="h-3 w-1/2 rounded-full" />
                      <SkeletonBlock className="h-9 w-24 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !hasItems ? (
              <div className="flex min-h-full flex-col items-center justify-center gap-5 px-8 py-16 text-center">
                <SmallCaps>Empty</SmallCaps>
                <p className="font-display text-2xl leading-snug text-foreground text-balance">Your cart is empty.</p>
                <p className="text-sm leading-6 text-muted-foreground">Add products from the catalog and review them here.</p>
                <Link to="/products" onClick={close} className={buttonClasses("primary")}>
                  Shop products
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border px-6" aria-label="Cart items">
                {cart.items.map((item) => (
                  <Line key={item._id} item={item} money={money} busyAction={busyAction} onQuantity={updateQuantity} onRemove={remove} onNavigate={close} />
                ))}
              </ul>
            )}

            {hasItems && assistant.drawerRecommendations ? (
              <div className="border-t border-border px-6 py-5">
                <RelatedProducts fromCart surface="drawer" perGroup={3} limitGroups={1} layout="row" title="Goes with your cart" onNavigate={close} className="[&_h2]:font-display [&_h2]:text-lg [&_h2]:font-normal" />
                {assistant.enabled ? (
                  <Link to="/cart" onClick={close} className="mt-3 inline-block text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground">
                    Ask {assistant.displayName} what else you need
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-border px-6 py-5">
            {threshold > 0 && hasItems ? (
              <div className="mb-5 flex flex-col gap-2">
                <p className="text-xs text-foreground">{remaining > 0 ? `${money(remaining)} away from free shipping` : "You've unlocked free shipping"}</p>
                <div className="h-px w-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : null}
            <dl className="flex flex-col divide-y divide-border border-y border-border text-sm">
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums text-foreground">{money(subtotal)}</dd>
              </div>
              {cart?.discountAmount ? (
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd className="tabular-nums text-foreground">-{money(cart.discountAmount)}</dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between py-3">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">Total</dt>
                <dd className="font-display text-2xl tabular-nums text-foreground">{money(cart?.totalAmount ?? 0)}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-col items-center gap-3">
              <Link to="/checkout" onClick={close} className={buttonClasses("primary", cn("w-full", !hasItems && "pointer-events-none opacity-50"))} aria-disabled={!hasItems}>
                Checkout
              </Link>
              <Link to="/cart" onClick={close} className="text-sm font-medium text-foreground underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground">
                View full cart
              </Link>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Line({
  item,
  money,
  busyAction,
  onQuantity,
  onRemove,
  onNavigate,
}: {
  item: CartLine;
  money: (amount: number) => string;
  busyAction: string | null;
  onQuantity: (itemId: string, quantity: number) => Promise<void>;
  onRemove: (itemId: string) => Promise<void>;
  onNavigate: () => void;
}) {
  const busy = busyAction !== null;
  const mediaId = item.variant?.featuredMediaId ?? item.product?.featuredMediaId;
  const title = getCartLineTitle(item.product, item.metadata);
  const subtitle = getCartLineSubtitle(item.metadata);
  const sku = getCartLineSku(item.product, item.metadata);
  const isBundle = item.metadata?.lineType === "bundle";
  const slug = item.product?.slug ?? "";

  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 py-5">
      <Link to="/products/$slug" params={{ slug }} onClick={onNavigate} className="block overflow-hidden rounded-xl bg-muted" tabIndex={-1} aria-hidden="true">
        <div className="aspect-[4/5]">{mediaId ? <MediaImage mediaId={mediaId as any} alt={item.product?.title} className="h-full w-full object-cover" preferredSize="medium" sizes="72px" /> : null}</div>
      </Link>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          {isBundle ? (
            <p className="font-display text-lg leading-snug text-foreground">{title}</p>
          ) : (
            <Link to="/products/$slug" params={{ slug }} onClick={onNavigate} className="font-display text-lg leading-snug text-foreground transition-colors hover:text-primary">
              {title}
            </Link>
          )}
          <p className="shrink-0 text-sm tabular-nums text-foreground">{money(item.lineTotalAmount)}</p>
        </div>
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
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        {sku ? <SmallCaps>SKU {sku}</SmallCaps> : null}
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="inline-flex h-9 items-center rounded-full border border-border" role="group" aria-label={`${title} quantity`}>
            <button type="button" onClick={() => void onQuantity(item._id, item.quantity - 1)} disabled={busy} aria-label="Decrease quantity" className="flex h-full w-9 items-center justify-center rounded-l-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
              <Minus className="size-3.5" aria-hidden="true" />
            </button>
            <span className="min-w-7 text-center text-sm font-semibold tabular-nums text-foreground">{item.quantity}</span>
            <button type="button" onClick={() => void onQuantity(item._id, item.quantity + 1)} disabled={busy} aria-label="Increase quantity" className="flex h-full w-9 items-center justify-center rounded-r-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
              <Plus className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <button type="button" onClick={() => void onRemove(item._id)} disabled={busy} className="text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-destructive disabled:opacity-50" aria-label={`Remove ${title}`}>
            {busyAction === `remove:${item._id}` ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </li>
  );
}
