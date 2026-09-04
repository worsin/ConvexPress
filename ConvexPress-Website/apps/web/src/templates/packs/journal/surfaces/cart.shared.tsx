/**
 * Journal · cart.shared — a cart someone shared by link, as a receipt: lines
 * as rule-separated rows on the left, the summary with the total in display
 * type on the right, and "Copy to my cart" as the one pill. Same states as
 * Core: loading, expired link, and the copy action waiting on the viewer's
 * session.
 */
import { getCartLineBundleSelections, getCartLineTitle } from "@/components/commerce/cartLine";
import { formatMoney } from "@/lib/commerce/format";
import type { SharedCartSurfaceData } from "@/templates/packs/core/surfaces/cart.shared";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Button, Container, EmptyState, LinkButton, SectionHeading, SkeletonBlock, SmallCaps } from "../parts";
import { AsideHeading, ReceiptList, ReceiptRow, ReceiptTotal } from "../parts/extra-commerce";

export default function JournalSharedCart({ data }: SurfaceProps<SharedCartSurfaceData>) {
  const { sharedCart, isReady, isCopying, onCopy } = data;
  const currency = sharedCart?.currencyCode ?? "USD";
  const money = (amount: number) => formatMoney(amount, currency);

  return (
    <Container data-slot="shared-cart" className="flex flex-col gap-10 py-6 md:gap-14 md:py-10">
      <SectionHeading level={1} eyebrow="Shared with you" title="Shared cart" lede="Review these items and copy them into your own cart when you are ready." />

      {sharedCart === undefined ? (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16" aria-hidden="true">
          <div className="flex flex-col divide-y divide-border border-y border-border">
            {[0, 1].map((item) => (
              <div key={item} className="flex items-center justify-between gap-6 py-6">
                <SkeletonBlock className="h-6 w-2/3" />
                <SkeletonBlock className="h-5 w-16" />
              </div>
            ))}
          </div>
          <SkeletonBlock className="h-48" />
        </div>
      ) : !sharedCart ? (
        <EmptyState
          eyebrow="Expired"
          title="This shared cart is no longer available."
          action={
            <LinkButton to="/products" variant="primary">
              Browse products
            </LinkButton>
          }
        />
      ) : (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16 lg:items-start">
          <ul className="flex flex-col divide-y divide-border border-y border-border" aria-label="Shared cart items">
            {sharedCart.items.map((item: any) => (
              <li key={item._id} className="flex items-start justify-between gap-6 py-6">
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="font-display text-xl leading-snug text-foreground">{getCartLineTitle(item.product, item.metadata)}</p>
                  {item.metadata?.lineType === "bundle" ? (
                    <div className="flex flex-wrap gap-1.5">
                      {getCartLineBundleSelections(item.metadata).map((selection) => (
                        <Badge key={selection.componentId} className="normal-case tracking-normal">
                          {selection.productTitle}
                          {selection.quantity > 1 ? ` ×${selection.quantity}` : ""}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <SmallCaps className="tabular-nums">Qty {item.quantity}</SmallCaps>
                </div>
                <p className="shrink-0 font-display text-lg tabular-nums text-foreground">{money(item.lineTotalAmount)}</p>
              </li>
            ))}
          </ul>

          <aside className="flex flex-col gap-8 lg:sticky lg:top-28" aria-label="Summary">
            <AsideHeading>Summary</AsideHeading>
            <ReceiptList>
              <ReceiptRow label="Items" value={sharedCart.itemCount} />
              <ReceiptRow label="Subtotal" value={money(sharedCart.subtotalAmount)} />
              <ReceiptTotal value={money(sharedCart.totalAmount)} />
            </ReceiptList>
            <Button variant="primary" onClick={() => void onCopy()} disabled={!isReady || isCopying} className="w-full">
              {isCopying ? "Copying…" : "Copy to my cart"}
            </Button>
          </aside>
        </div>
      )}
    </Container>
  );
}
