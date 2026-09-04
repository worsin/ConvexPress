/**
 * Depot · chrome.cartDrawer — the cart panel opened from the header, as a
 * dense table of lines with quantity steppers, a free-shipping meter, totals
 * and the checkout / full-cart actions. Reads the shared `useCart` state so
 * the steppers stay in sync with the grid and the rail; "goes with your
 * cart" and the assistant link follow the same settings as Core.
 */
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import { RelatedProducts } from "@/components/shop/RelatedProducts";
import { useSettings } from "@/contexts/SettingsContext";
import { useAssistantConfig } from "@/hooks/useAssistantConfig";
import { useCart, type CartLineSummary } from "@/hooks/useCart";
import { formatMoney } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";
import type { CartDrawerSurfaceData } from "@/templates/packs/core/surfaces/chrome.cartDrawer";
import type { SurfaceProps } from "@/templates/sdk/types";

import { DataTable, Label, LinkButton, Skeleton, Td, Th, buttonClasses } from "../parts";

export default function DepotCartDrawer({ data }: SurfaceProps<CartDrawerSurfaceData>) {
  const { open, onOpenChange } = data;
  const settings = useSettings();
  const { cart, isReady, loading, lineByProduct, setQuantity, busyProductId } = useCart();
  const assistant = useAssistantConfig();
  const currency = cart?.currencyCode ?? settings?.commerceConfig?.currencyCode ?? "USD";
  const money = (amount: number) => formatMoney(amount, currency);
  const threshold = assistant.freeShippingThresholdMinor;
  const subtotal = cart?.subtotalAmount ?? 0;
  const remaining = threshold > 0 ? Math.max(0, threshold - subtotal) : 0;
  const hasItems = !!cart && cart.items.length > 0;
  const close = () => onOpenChange(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/40 transition-opacity duration-200 data-closed:opacity-0 data-open:opacity-100" />
        <DialogPrimitive.Popup
          data-slot="cart-drawer"
          data-pack="depot"
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-[min(100vw,34rem)] flex-col bg-background shadow-lg ring-1 ring-border outline-hidden transition-transform duration-300",
            "data-closed:translate-x-full data-open:translate-x-0",
          )}
        >
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <div className="flex flex-col leading-none">
              <Label className="text-[10px]">Your cart</Label>
              <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
                Cart{cart?.itemCount ? <span className="ml-1.5 text-[13px] font-normal tabular-nums text-muted-foreground">{cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}</span> : null}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Close cart">
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {!isReady || loading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : !hasItems ? (
              <div className="flex min-h-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-card px-6 py-12 text-center">
                <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <ShoppingBag className="size-5" aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold text-foreground">Your cart is empty.</p>
                <p className="text-[13px] text-muted-foreground">Add products from the catalog and review them here.</p>
                <Link to="/shop" onClick={close} className={buttonClasses("primary")}>
                  Shop products
                </Link>
              </div>
            ) : (
              <DataTable caption="Cart items">
                <thead>
                  <tr>
                    <Th>Item</Th>
                    <Th>Qty</Th>
                    <Th className="text-right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {cart!.items.map((line) => (
                    <DrawerRow
                      key={line.itemId}
                      line={line}
                      money={money}
                      editable={lineByProduct.get(line.productId)?.itemId === line.itemId}
                      busy={busyProductId === line.productId || !isReady}
                      onQuantity={(quantity) => void setQuantity(line.productId, quantity)}
                      onNavigate={close}
                    />
                  ))}
                </tbody>
              </DataTable>
            )}

            {hasItems && assistant.drawerRecommendations && (
              <div className="mt-4 border-t border-border pt-4">
                <RelatedProducts fromCart surface="drawer" perGroup={3} limitGroups={1} layout="row" title="Goes with your cart" onNavigate={close} className="[&_h2]:text-sm" />
                {assistant.enabled && (
                  <Link to="/cart" onClick={close} className="mt-2 inline-flex text-[13px] font-medium text-primary hover:underline">
                    Ask {assistant.displayName} what else you need
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-border bg-card p-4">
            {threshold > 0 && hasItems && (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-foreground">{remaining > 0 ? `${money(remaining)} away from free shipping` : "You've unlocked free shipping"}</p>
                <div className="h-1.5 overflow-hidden rounded-md bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round((subtotal / threshold) * 100))}>
                  <div className="h-full rounded-md bg-primary transition-[width]" style={{ width: `${Math.min(100, (subtotal / threshold) * 100)}%` }} />
                </div>
              </div>
            )}
            <DataTable
              caption="Totals"
              firstColumnLabel
              rows={[
                { key: "subtotal", cells: ["Subtotal", <span className="tabular-nums">{money(subtotal)}</span>] },
                ...(cart?.discountAmount ? [{ key: "discount", cells: ["Discount", <span className="tabular-nums">-{money(cart.discountAmount)}</span>] }] : []),
                { key: "total", cells: [<span className="font-semibold text-foreground">Total</span>, <span className="text-lg font-semibold tabular-nums text-foreground">{money(cart?.totalAmount ?? 0)}</span>] },
              ]}
            />
            <div className="grid grid-cols-2 gap-2">
              <LinkButton to="/cart" variant="secondary" onClick={close}>
                View full cart
              </LinkButton>
              <Link to="/checkout" onClick={close} className={cn(buttonClasses("primary"), !hasItems && "pointer-events-none opacity-50")} aria-disabled={!hasItems || undefined}>
                Checkout
              </Link>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DrawerRow({
  line,
  money,
  editable,
  busy,
  onQuantity,
  onNavigate,
}: {
  line: CartLineSummary;
  money: (amount: number) => string;
  /** False when another line of the same product owns the stepper; edit those on the cart page. */
  editable: boolean;
  busy: boolean;
  onQuantity: (quantity: number) => void;
  onNavigate: () => void;
}) {
  return (
    <tr className="border-t border-border">
      <Td className="min-w-40">
        <div className="flex gap-2.5">
          <Link to="/products/$slug" params={{ slug: line.slug }} onClick={onNavigate} className="size-12 shrink-0 overflow-hidden rounded-md bg-muted/40">
            {line.featuredMediaId ? (
              <MediaImage mediaId={line.featuredMediaId as any} alt={line.title} className="h-full w-full object-cover" preferredSize="thumbnail" sizes="48px" />
            ) : (
              <span className="flex h-full items-center justify-center text-muted-foreground">
                <ShoppingBag className="size-4" aria-hidden="true" />
              </span>
            )}
          </Link>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link to="/products/$slug" params={{ slug: line.slug }} onClick={onNavigate} className="line-clamp-2 text-[13px] font-semibold leading-4 text-foreground hover:text-primary">
              {line.title}
            </Link>
            <span className="text-xs tabular-nums text-muted-foreground">{money(line.unitPriceAmount)} each</span>
          </div>
        </div>
      </Td>
      <Td>
        {editable ? (
          <div className="inline-flex h-8 items-center rounded-md border border-border bg-background" role="group" aria-label={`Quantity for ${line.title}`}>
            <button
              type="button"
              onClick={() => onQuantity(line.quantity - 1)}
              disabled={busy}
              aria-label={line.quantity === 1 ? `Remove ${line.title}` : `Decrease ${line.title}`}
              className="flex h-full w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {line.quantity === 1 ? <Trash2 className="size-3.5" aria-hidden="true" /> : <Minus className="size-3.5" aria-hidden="true" />}
            </button>
            <span className="min-w-7 text-center text-[13px] font-semibold tabular-nums">{line.quantity}</span>
            <button type="button" onClick={() => onQuantity(line.quantity + 1)} disabled={busy} aria-label={`Increase ${line.title}`} className="flex h-full w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
              <Plus className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold tabular-nums">{line.quantity}</span>
            <Link to="/cart" onClick={onNavigate} className="text-xs font-medium text-primary hover:underline">
              Edit in cart
            </Link>
          </div>
        )}
      </Td>
      <Td align="right" className="whitespace-nowrap font-semibold text-foreground">
        {money(line.lineTotalAmount)}
      </Td>
    </tr>
  );
}
