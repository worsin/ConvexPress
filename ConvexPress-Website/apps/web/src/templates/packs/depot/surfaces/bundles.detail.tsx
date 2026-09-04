/**
 * Depot · bundles.detail — one bundle. Left column: the overview card
 * (component chips and the savings badge), the component picker as a grid
 * of cards (checkbox, quantity stepper, variant select, required / discount
 * badges), the description. Right: a sticky buy box with the badges, name,
 * live price, item-count line with reset, add to cart, view cart, and a
 * table of the bundle facts. Every callback and gate from Core is kept.
 */
import { Check, Minus, Package, Plus, ShoppingCart } from "lucide-react";

import { formatMoney } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";
import type { BundleComponent, BundleDetailSurfaceData } from "@/templates/packs/core/surfaces/bundles.detail";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Breadcrumbs, Button, Card, Container, DataTable, Label, LinkButton, Price, Prose, SectionHeading, Skeleton, StickyPanel } from "../parts";
import { Notice, inputClasses } from "../parts/extra-commerce";

function unitPriceOf(component: BundleComponent): number {
  if (component.variant?.price) {
    const price = component.variant.price;
    return typeof price === "object" ? price.amount : price;
  }
  if (component.product?.basePrice) {
    const price = component.product.basePrice;
    return typeof price === "object" ? price.amount : price;
  }
  return 0;
}

export default function DepotBundleDetail({ data }: SurfaceProps<BundleDetailSurfaceData>) {
  const { bundle, currencyCode, isConfigurable, priceData, selections, totalSelectedItems, meetsMinItems, canAddToCart, onToggleComponent, onUpdateQuantity, onSetVariant, onResetDefaults, onAddToCart } = data;
  const money = (amount: number) => formatMoney(amount, currencyCode);
  const typeLabel = bundle.bundleType === "mix_and_match" ? "Mix & Match" : bundle.bundleType === "bogo" ? "Configurable" : "Bundle";
  const pricingLabel = bundle.pricingType === "fixed" ? "Fixed price" : bundle.pricingType === "percent_off" ? `${bundle.discountPercent ?? 0}% off` : bundle.pricingType === "amount_off" ? `${money(bundle.discountAmount ?? 0)} off` : "Sum of components";

  return (
    <Container padded={false} data-slot="bundle-detail" className="flex flex-col gap-4 py-6 md:py-8">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Bundles", to: "/bundles" }, { label: bundle.name }]} />

      <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
        <div className="flex flex-col gap-6 xl:col-span-8">
          <Card className="relative flex flex-col items-center gap-3 p-6 text-center">
            <Package className="size-10 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-foreground">
              {bundle.components.length} {bundle.components.length === 1 ? "product" : "products"} in this bundle
            </h2>
            <div className="flex flex-wrap justify-center gap-1">
              {bundle.components.map((component) => (
                <Badge key={component._id} tone="stock" className="normal-case tracking-normal">
                  {component.product?.title ?? "Product"}
                  {component.quantity > 1 ? ` x${component.quantity}` : ""}
                </Badge>
              ))}
            </div>
            {priceData && priceData.savingsPercent > 0 && (
              <Badge tone="sale" className="absolute left-3 top-3">
                Save {priceData.savingsPercent}%
              </Badge>
            )}
          </Card>

          <section className="flex flex-col gap-3" aria-labelledby="bundle-components">
            <SectionHeading title={isConfigurable ? "Choose your products" : "What's included"} count={bundle.components.length} />
            {isConfigurable && (
              <p className="text-[13px] text-muted-foreground">
                Select the products you want in your bundle.
                {bundle.minItems ? ` Minimum ${bundle.minItems} items.` : ""}
                {bundle.maxItems ? ` Maximum ${bundle.maxItems} items.` : ""}
              </p>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {bundle.components.map((component) => {
                const unitPrice = unitPriceOf(component);
                const selected = isConfigurable ? selections.has(component._id) : true;
                const quantity = selections.get(component._id)?.quantity ?? component.quantity;
                return (
                  <Card key={component._id} className={cn("flex items-start gap-3 p-3 transition-colors", selected ? "border-primary/50 bg-primary/5" : "bg-background")}>
                    {isConfigurable && (
                      <button
                        type="button"
                        onClick={() => {
                          if (component.isRequired) return;
                          onToggleComponent(component);
                        }}
                        disabled={component.isRequired}
                        aria-pressed={selected}
                        aria-label={`${selected ? "Remove" : "Add"} ${component.product?.title ?? "product"}`}
                        className={cn(
                          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                          selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-transparent",
                          component.isRequired ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary/60",
                        )}
                      >
                        <Check className="size-3.5" aria-hidden="true" />
                      </button>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <h3 className="text-sm font-semibold leading-5 text-foreground">{component.product?.title ?? "Product"}</h3>
                          {component.label ? <p className="text-xs text-muted-foreground">{component.label}</p> : null}
                          {component.variant?.name ? <p className="text-xs text-muted-foreground">Variant: {component.variant.name}</p> : null}
                        </div>
                        {unitPrice > 0 ? (
                          <div className="flex shrink-0 flex-col items-end">
                            <span className="text-sm font-semibold tabular-nums text-foreground">{money(unitPrice)}</span>
                            {component.priceOverride != null ? <span className="text-xs tabular-nums text-muted-foreground line-through">{money(unitPrice)}</span> : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {isConfigurable && selected ? (
                          <div className="inline-flex h-8 items-center rounded-md border border-border bg-background" role="group" aria-label={`Quantity for ${component.product?.title ?? "product"}`}>
                            <button type="button" onClick={() => onUpdateQuantity(component._id, -1)} aria-label="Decrease quantity" className="flex h-full w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground">
                              <Minus className="size-3.5" aria-hidden="true" />
                            </button>
                            <span className="min-w-7 text-center text-[13px] font-semibold tabular-nums">{quantity}</span>
                            <button type="button" onClick={() => onUpdateQuantity(component._id, 1)} aria-label="Increase quantity" className="flex h-full w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground">
                              <Plus className="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[13px] tabular-nums text-muted-foreground">Qty: {component.quantity}</span>
                        )}
                        {component.allowVariantChange && component.variants && component.variants.length > 0 && (
                          <select value={selections.get(component._id)?.variantId ?? ""} onChange={(event) => onSetVariant(component._id, event.target.value || undefined)} aria-label="Variant" className={cn(inputClasses, "h-8 w-auto")}>
                            <option value="">Default variant</option>
                            {component.variants.map((variant) => (
                              <option key={variant._id} value={variant._id}>
                                {variant.title || variant.name || "Variant"}
                              </option>
                            ))}
                          </select>
                        )}
                        {component.isRequired && <Badge tone="new">Required</Badge>}
                        {component.discountPercent != null && component.discountPercent > 0 && <Badge tone="sale">-{component.discountPercent}%</Badge>}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          {bundle.description && (
            <section className="flex flex-col gap-3" aria-labelledby="bundle-about">
              <SectionHeading title="About this bundle" />
              <Card className="p-4">
                <Prose className="mx-0 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{bundle.description}</Prose>
              </Card>
            </section>
          )}
        </div>

        <StickyPanel label="Buy box" className="xl:col-span-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="new">{typeLabel}</Badge>
            <Badge tone="stock">{bundle.status}</Badge>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Bundle</Label>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{bundle.name}</h1>
            {bundle.shortDescription ? <p className="text-[13px] leading-5 text-muted-foreground">{bundle.shortDescription}</p> : null}
          </div>

          {priceData ? (
            <div className="flex flex-col gap-1">
              <Price amount={priceData.bundlePrice} compareAt={priceData.savings > 0 ? priceData.regularPrice : null} currency={currencyCode} size="lg" />
              {priceData.savings > 0 && (
                <p className="text-[13px] font-semibold text-primary">
                  You save {money(priceData.savings)} ({priceData.savingsPercent}% off)
                </p>
              )}
            </div>
          ) : (
            <Skeleton className="h-9 w-40" />
          )}

          {isConfigurable && (
            <Notice>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-semibold text-foreground">{totalSelectedItems}</span> {totalSelectedItems === 1 ? "item" : "items"} selected
                  {bundle.minItems ? ` (min ${bundle.minItems})` : ""}
                  {bundle.maxItems ? ` (max ${bundle.maxItems})` : ""}
                  {!meetsMinItems ? <span className="ml-1 font-semibold text-primary">Need {bundle.minItems! - totalSelectedItems} more</span> : null}
                </span>
                <button type="button" onClick={onResetDefaults} className="text-[13px] font-medium text-primary hover:underline">
                  Reset to defaults
                </button>
              </div>
            </Notice>
          )}

          <Button onClick={() => void onAddToCart()} disabled={!canAddToCart} className="w-full">
            <ShoppingCart className="size-4" aria-hidden="true" />
            Add bundle to cart
          </Button>
          <LinkButton to="/cart" variant="secondary" className="w-full">
            View cart
          </LinkButton>

          <DataTable
            caption="Bundle details"
            firstColumnLabel
            rows={[
              { key: "type", cells: ["Type", bundle.bundleType === "mix_and_match" ? "Mix & Match" : bundle.bundleType === "bogo" ? "Configurable" : "Fixed bundle"] },
              { key: "pricing", cells: ["Pricing", pricingLabel] },
              { key: "products", cells: ["Products", <span className="tabular-nums">{bundle.components.length} included</span>] },
              { key: "slug", cells: ["Slug", <span className="break-all">{bundle.slug}</span>] },
            ]}
          />
        </StickyPanel>
      </div>
    </Container>
  );
}
