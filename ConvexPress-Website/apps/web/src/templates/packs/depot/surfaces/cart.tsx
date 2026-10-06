/**
 * Depot · cart — a table of lines with quantity steppers and a sticky
 * summary (discount code, totals, checkout, clear, sharing, "goes with your
 * cart"). Same actions and states as Core, laid out as a data table.
 */
import { Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2 } from "lucide-react";

import { getCartLineBundleSelections, getCartLineSku, getCartLineSubtitle, getCartLineTitle } from "@/components/commerce/cartLine";
import { MediaImage } from "@/components/media/MediaImage";
import { RelatedProducts } from "@/components/shop/RelatedProducts";
import { formatMoney } from "@/lib/commerce/format";
import type { CartSurfaceData, CartSurfaceItem } from "@/templates/packs/core/surfaces/cart";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Button, DataTable, EmptyState, Label, LinkButton, Skeleton, StickyPanel, Td, Th } from "../parts";

export default function DepotCart({ data }: SurfaceProps<CartSurfaceData>) {
  const { isReady, cart, currencyCode, busyAction, sharing, discountCode, onDiscountCodeChange, actions } = data;
  const money = (amount: number) => formatMoney(amount, currencyCode);
  const busy = busyAction !== null;

  return (
    <div data-pack="depot" className="flex w-full flex-col gap-4 py-4 pb-12 lg:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Label>Your cart</Label>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Cart</h1>
        </div>
        {cart && cart.items.length > 0 ? (
          <p className="text-[13px] tabular-nums text-muted-foreground">
            {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
          </p>
        ) : null}
      </div>

      {!isReady || cart === undefined ? (
        <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <Skeleton className="h-48 xl:col-span-8" />
          <Skeleton className="h-64 xl:col-span-4" />
        </div>
      ) : !cart || cart.items.length === 0 ? (
        <EmptyState title="Your cart is empty." description="Add something from the catalog and it shows up here." action={<LinkButton to="/products">Browse products</LinkButton>} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <DataTable caption="Cart items" className="xl:col-span-8">
            <thead>
              <tr>
                <Th>Item</Th>
                <Th className="hidden md:table-cell">Unit</Th>
                <Th>Qty</Th>
                <Th className="text-right">Total</Th>
                <Th>
                  <span className="sr-only">Remove</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {cart.items.map((item) => (
                <CartRow key={item._id} item={item} money={money} busy={busy} busyAction={busyAction} onQuantity={(quantity) => void actions.updateQuantity(item._id, quantity)} onRemove={() => void actions.remove(item._id)} />
              ))}
            </tbody>
          </DataTable>

          <StickyPanel label="Order summary" className="xl:col-span-4">
            <h2 className="text-lg font-semibold text-foreground">Summary</h2>

            {cart.appliedDiscountCode ? (
              <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-foreground">Code {cart.appliedDiscountCode}</span>
                  <Badge tone="sale">Applied</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{cart.appliedDiscountDescription || "Discount applied to cart"}</p>
                <button type="button" onClick={() => void actions.removeDiscount()} disabled={busy} className="self-start text-[13px] font-medium text-primary hover:underline disabled:opacity-50">
                  {busyAction === "discount" ? "Removing..." : "Remove discount"}
                </button>
              </div>
            ) : (
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (discountCode.trim()) void actions.applyDiscount();
                }}
              >
                <input
                  value={discountCode}
                  onChange={(event) => onDiscountCodeChange(event.target.value.toUpperCase())}
                  placeholder="Discount code"
                  aria-label="Discount code"
                  className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-[13px] uppercase text-foreground placeholder:normal-case placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <Button type="submit" variant="secondary" disabled={busy || !discountCode.trim()}>
                  {busyAction === "discount" ? "Applying..." : "Apply"}
                </Button>
              </form>
            )}

            <DataTable
              caption="Totals"
              firstColumnLabel
              rows={[
                { key: "items", cells: ["Items", <span className="tabular-nums">{cart.itemCount}</span>] },
                { key: "subtotal", cells: ["Subtotal", <span className="tabular-nums">{money(cart.subtotalAmount)}</span>] },
                ...(cart.discountAmount > 0
                  ? [{ key: "discount", cells: [`Discount${cart.appliedDiscountCode ? ` (${cart.appliedDiscountCode})` : ""}`, <span className="tabular-nums">-{money(cart.discountAmount)}</span>] }]
                  : []),
                { key: "total", cells: [<span className="font-semibold text-foreground">Total</span>, <span className="text-lg font-semibold tabular-nums text-foreground">{money(cart.totalAmount)}</span>] },
              ]}
            />

            <LinkButton to="/checkout" className="w-full">
              Continue to checkout
            </LinkButton>
            <Button variant="secondary" onClick={() => void actions.clear()} disabled={busy} className="w-full">
              {busyAction === "clear" ? "Clearing..." : "Clear cart"}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="quiet" size="sm" onClick={() => void actions.enableSharing()} disabled={sharing} className="border border-border">
                Copy share link
              </Button>
              <Button variant="quiet" size="sm" onClick={() => void actions.disableSharing()} disabled={sharing} className="border border-border">
                Disable sharing
              </Button>
            </div>

            <div className="border-t border-border pt-3">
              <RelatedProducts fromCart surface="cart_page" perGroup={2} limitGroups={2} layout="row" title="Goes with your cart" className="[&_h2]:text-base" />
            </div>
          </StickyPanel>
        </div>
      )}
    </div>
  );
}

function CartRow({
  item,
  money,
  busy,
  busyAction,
  onQuantity,
  onRemove,
}: {
  item: CartSurfaceItem;
  money: (amount: number) => string;
  busy: boolean;
  busyAction: string | null;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const mediaId = item.variant?.featuredMediaId ?? item.product?.featuredMediaId;
  const bundle = item.metadata?.lineType === "bundle";
  const title = getCartLineTitle(item.product, item.metadata);
  const subtitle = getCartLineSubtitle(item.metadata, item.variant);
  const sku = getCartLineSku(item.product, item.metadata, item.variant);
  const unit = item.quantity > 0 ? item.lineTotalAmount / item.quantity : item.lineTotalAmount;

  return (
    <tr className="border-t border-border">
      <Td className="min-w-56">
        <div className="flex gap-3">
          <div className="size-14 shrink-0 overflow-hidden rounded-md bg-muted/40">
            {mediaId ? <MediaImage mediaId={mediaId as any} alt={item.product?.title} className="h-full w-full object-cover" preferredSize="thumbnail" sizes="56px" /> : null}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            {bundle ? (
              <>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <div className="flex flex-wrap gap-1">
                  {getCartLineBundleSelections(item.metadata).map((selection) => (
                    <Badge key={selection.componentId} tone="stock" className="normal-case tracking-normal">
                      {selection.productTitle}
                      {selection.quantity > 1 ? ` x${selection.quantity}` : ""}
                    </Badge>
                  ))}
                </div>
              </>
            ) : (
              <>
                <Link to="/products/$slug" params={{ slug: item.product?.slug ?? "" }} className="line-clamp-2 text-sm font-semibold text-foreground hover:text-primary">
                  {title}
                </Link>
                {subtitle ? <p className="text-[13px] text-muted-foreground">{subtitle}</p> : null}
                {sku ? <p className="text-xs tabular-nums text-muted-foreground">SKU {sku}</p> : null}
              </>
            )}
          </div>
        </div>
      </Td>
      <Td className="hidden whitespace-nowrap tabular-nums text-muted-foreground md:table-cell">{money(Math.round(unit))}</Td>
      <Td>
        <div className="inline-flex h-10 items-center rounded-md border border-border bg-background" role="group" aria-label={`Quantity for ${title}`}>
          <button
            type="button"
            onClick={() => onQuantity(item.quantity - 1)}
            disabled={busy}
            aria-label={item.quantity === 1 ? `Remove ${title}` : `Decrease ${title}`}
            className="flex h-full w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {item.quantity === 1 ? <Trash2 className="size-3.5" aria-hidden="true" /> : <Minus className="size-3.5" aria-hidden="true" />}
          </button>
          <span className="min-w-8 text-center text-[13px] font-semibold tabular-nums">{item.quantity}</span>
          <button
            type="button"
            onClick={() => onQuantity(item.quantity + 1)}
            disabled={busy}
            aria-label={`Increase ${title}`}
            className="flex h-full w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </Td>
      <Td align="right" className="whitespace-nowrap font-semibold text-foreground">
        {money(item.lineTotalAmount)}
      </Td>
      <Td align="right">
        <button type="button" onClick={onRemove} disabled={busy} className="text-[13px] font-medium text-destructive hover:underline disabled:opacity-50">
          {busyAction === `remove:${item._id}` ? "Removing..." : "Remove"}
        </button>
      </Td>
    </tr>
  );
}
