/**
 * Depot · cart.shared — a cart another shopper shared by link: a table of
 * lines and a sticky summary with "Copy to my cart" (disabled until the
 * viewer's own commerce session is ready, and while copying).
 */
import { getCartLineBundleSelections, getCartLineSku, getCartLineSubtitle, getCartLineTitle } from "@/components/commerce/cartLine";
import { formatMoney } from "@/lib/commerce/format";
import type { SharedCartSurfaceData } from "@/templates/packs/core/surfaces/cart.shared";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Button, Container, DataTable, EmptyState, LinkButton, Skeleton, StickyPanel, Td, Th } from "../parts";
import { PageHeader } from "../parts/extra";

export default function DepotSharedCart({ data }: SurfaceProps<SharedCartSurfaceData>) {
  const { sharedCart, isReady, isCopying, onCopy } = data;
  const money = (amount: number) => formatMoney(amount, sharedCart?.currencyCode ?? "USD");

  return (
    <Container padded={false} data-slot="shared-cart" className="flex flex-col gap-4 py-6 md:py-8">
      <PageHeader label="Shared with you" title="Shared cart" description="Review these items and copy them into your cart when you are ready." meta={sharedCart ? `${sharedCart.itemCount} ${sharedCart.itemCount === 1 ? "item" : "items"}` : undefined} />

      {sharedCart === undefined ? (
        <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <Skeleton className="h-48 xl:col-span-8" />
          <Skeleton className="h-56 xl:col-span-4" />
        </div>
      ) : !sharedCart ? (
        <EmptyState title="This shared cart is no longer available." action={<LinkButton to="/products">Browse products</LinkButton>} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <DataTable caption="Shared cart items" className="xl:col-span-8">
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Qty</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {sharedCart.items.map((item: any) => {
                const bundle = item.metadata?.lineType === "bundle";
                const subtitle = getCartLineSubtitle(item.metadata);
                const sku = getCartLineSku(item.product, item.metadata);
                return (
                  <tr key={item._id} className="border-t border-border">
                    <Td className="min-w-56">
                      <div className="flex flex-col gap-0.5">
                        <p className="text-sm font-semibold text-foreground">{getCartLineTitle(item.product, item.metadata)}</p>
                        {bundle ? (
                          <div className="flex flex-wrap gap-1">
                            {getCartLineBundleSelections(item.metadata).map((selection) => (
                              <Badge key={selection.componentId} tone="stock" className="normal-case tracking-normal">
                                {selection.productTitle}
                                {selection.quantity > 1 ? ` x${selection.quantity}` : ""}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <>
                            {subtitle ? <p className="text-[13px] text-muted-foreground">{subtitle}</p> : null}
                            {sku ? <p className="text-xs tabular-nums text-muted-foreground">SKU {sku}</p> : null}
                          </>
                        )}
                      </div>
                    </Td>
                    <Td className="tabular-nums">{item.quantity}</Td>
                    <Td align="right" className="whitespace-nowrap font-semibold text-foreground">
                      {money(item.lineTotalAmount)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>

          <StickyPanel label="Summary" className="xl:col-span-4">
            <h2 className="text-lg font-semibold text-foreground">Summary</h2>
            <DataTable
              caption="Totals"
              firstColumnLabel
              rows={[
                { key: "items", cells: ["Items", <span className="tabular-nums">{sharedCart.itemCount}</span>] },
                { key: "subtotal", cells: ["Subtotal", <span className="tabular-nums">{money(sharedCart.subtotalAmount)}</span>] },
                { key: "total", cells: [<span className="font-semibold text-foreground">Total</span>, <span className="text-lg font-semibold tabular-nums text-foreground">{money(sharedCart.totalAmount)}</span>] },
              ]}
            />
            <Button onClick={() => void onCopy()} disabled={!isReady || isCopying} className="w-full">
              {isCopying ? "Copying..." : "Copy to my cart"}
            </Button>
            <LinkButton to="/products" variant="secondary" className="w-full">
              Browse products
            </LinkButton>
          </StickyPanel>
        </div>
      )}
    </Container>
  );
}
