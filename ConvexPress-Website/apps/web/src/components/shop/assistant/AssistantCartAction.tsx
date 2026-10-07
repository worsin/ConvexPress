import { useRef, useState } from 'react';
import { formatMoney } from '@/lib/commerce/format';
import type { ProductCardData } from '../ProductMiniCard';
import type { AssistantBlock } from './useAssistant';

export function AssistantCartAction({ block, product, onConfirm }: {
  block: Extract<AssistantBlock, { type: 'cart_proposal' }>;
  product?: ProductCardData;
  onConfirm?: (id: string) => Promise<boolean>;
}) {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const added = block.added || confirmed;
  // Product cards quote their default option. A proposal may name a different
  // variant; its price and inventory are revalidated by the normal cart writer.
  const available = !!product && (!!block.variantId || product.inStock);
  return <section className="space-y-2 rounded-lg border border-border bg-background p-3">
    <p className="text-sm font-semibold">{block.quantity} × {block.title}</p>
    {product && <p className="text-xs text-muted-foreground">{block.variantId ? 'Option price calculated in your cart' : `${formatMoney(product.price.amount, product.price.currencyCode)} each`}</p>}
    <button type="button" disabled={added || busy || !onConfirm || !available}
      aria-label={added ? `Added ${block.quantity} ${block.title} to cart` : `Add ${block.quantity} ${block.title} to cart`}
      className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      onClick={() => {
        if (busyRef.current || added || !onConfirm || !available) return;
        busyRef.current = true;
        setBusy(true);
        void onConfirm(block.id).then((ok) => { if (ok) setConfirmed(true); })
          .finally(() => { busyRef.current = false; setBusy(false); });
      }}>
      {added ? 'Added to cart' : busy ? 'Adding…' : product && !available ? 'Unavailable' : `Add ${block.quantity} to cart`}
    </button>
    {!added && <p className="text-xs text-muted-foreground">Your cart changes only when you select Add.</p>}
  </section>;
}
