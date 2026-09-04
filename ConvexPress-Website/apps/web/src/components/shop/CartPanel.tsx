/**
 * Persistent cart: the always-visible column beside the catalog and product
 * pages (Amazon-style). Same reactive cart as every stepper, drawer and the
 * cart page, so quantities agree everywhere.
 */

import { Link } from "@tanstack/react-router";
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import { useAssistantConfig } from "@/hooks/useAssistantConfig";
import { useCart, type CartLineSummary } from "@/hooks/useCart";
import { formatMoney } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";

export function CartPanel({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { cart, loading, setQuantity, busyProductId, enabled } = useCart();
  const assistant = useAssistantConfig();
  if (!enabled) return null;

  const currency = cart?.currencyCode ?? "USD";
  const subtotal = cart?.subtotalAmount ?? 0;
  const threshold = assistant.freeShippingThresholdMinor;
  const remaining = threshold > 0 ? Math.max(0, threshold - subtotal) : 0;
  const items = cart?.items ?? [];
  const count = cart?.itemCount ?? 0;

  return (
    <section
      data-slot="cart-panel"
      aria-label="Your cart"
      className={cn("flex h-full min-h-0 flex-col rounded-xl border border-border bg-card text-foreground shadow-sm", className)}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ShoppingBag className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Your cart</h2>
            <p className="text-[11px] text-muted-foreground">
              {count === 0 ? "Nothing yet" : `${count} ${count === 1 ? "item" : "items"}`}
            </p>
          </div>
        </div>
        <Link to="/cart" className="text-xs font-medium text-primary hover:underline">
          View
        </Link>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading && !cart ? (
          <ul className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <li key={index} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-8 text-center">
            <ShoppingBag className="size-7 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Your cart is empty</p>
            <p className="text-xs text-muted-foreground">Add something and it shows up here, right beside what you are browsing.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((line) => (
              <CartPanelLine
                key={line.itemId}
                line={line}
                currency={currency}
                busy={busyProductId === line.productId}
                compact={compact}
                onQuantity={(quantity) => void setQuantity(line.productId, quantity)}
              />
            ))}
          </ul>
        )}
      </div>

      <footer className="space-y-3 border-t border-border px-4 py-3">
        {threshold > 0 && items.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              {remaining > 0 ? `${formatMoney(remaining, currency)} away from free shipping` : "You have free shipping"}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round((subtotal / threshold) * 100))}>
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.min(100, (subtotal / threshold) * 100)}%` }} />
            </div>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Subtotal</span>
          <span className="text-base font-semibold tabular-nums">{formatMoney(subtotal, currency)}</span>
        </div>
        <Link
          to="/checkout"
          aria-disabled={items.length === 0}
          className={cn(
            "flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90",
            items.length === 0 && "pointer-events-none opacity-50",
          )}
        >
          Checkout <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </footer>
    </section>
  );
}

function CartPanelLine({
  line,
  currency,
  busy,
  compact,
  onQuantity,
}: {
  line: CartLineSummary;
  currency: string;
  busy: boolean;
  compact: boolean;
  onQuantity: (quantity: number) => void;
}) {
  return (
    <li className="flex gap-2.5 rounded-lg border border-border/70 bg-background p-2">
      <Link to="/products/$slug" params={{ slug: line.slug }} className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">
        {line.featuredMediaId ? (
          <MediaImage mediaId={line.featuredMediaId as any} alt={line.title} className="size-full object-cover" preferredSize="thumbnail" sizes="56px" />
        ) : null}
      </Link>
      <div className="min-w-0 flex-1">
        <Link to="/products/$slug" params={{ slug: line.slug }} className={cn("block truncate font-medium text-foreground hover:text-primary", compact ? "text-xs" : "text-[13px]")}>
          {line.title}
        </Link>
        <p className="text-xs tabular-nums text-muted-foreground">{formatMoney(line.lineTotalAmount, currency)}</p>
        <div className="mt-1 inline-flex h-7 items-center rounded-md border border-border">
          <button
            type="button"
            disabled={busy}
            onClick={() => onQuantity(line.quantity - 1)}
            aria-label={line.quantity === 1 ? `Remove ${line.title}` : `Decrease ${line.title}`}
            className="flex h-full w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {line.quantity === 1 ? <Trash2 className="size-3" aria-hidden="true" /> : <Minus className="size-3" aria-hidden="true" />}
          </button>
          <span className="min-w-6 text-center text-xs font-semibold tabular-nums">{line.quantity}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onQuantity(line.quantity + 1)}
            aria-label={`Increase ${line.title}`}
            className="flex h-full w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <Plus className="size-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}
