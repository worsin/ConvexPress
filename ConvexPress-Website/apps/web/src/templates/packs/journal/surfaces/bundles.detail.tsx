/**
 * Journal · bundles.detail — one bundle in the split layout of the product
 * page: a sticky 4:5 image (or the component names) on the left; on the
 * right the type in small caps, the name in display type, the live price
 * with savings, the add-to-cart pill, and the details as a rule-separated
 * list. The components follow as rule-separated rows — a round check, the
 * quantity stepper pill and the variant select for configurable bundles —
 * with the description in the reading measure. Same selection rules as
 * Core (required components stay selected, min / max item counts gate the
 * pill).
 */
import { Link } from "@tanstack/react-router";
import { Check, Minus, Plus } from "lucide-react";

import { formatMoney } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";
import type { BundleComponent, BundleDetailSurfaceData } from "@/templates/packs/core/surfaces/bundles.detail";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Breadcrumbs, Button, Container, Price, Prose, Rule, SectionHeading, SkeletonBlock, SmallCaps, buttonClasses } from "../parts";
import { ReceiptList, ReceiptRow, UnderlineSelect } from "../parts/extra-commerce";

function unitPrice(component: BundleComponent): number {
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

export default function JournalBundleDetail({ data }: SurfaceProps<BundleDetailSurfaceData>) {
  const { bundle, currencyCode, isConfigurable, priceData, selections, totalSelectedItems, meetsMinItems, canAddToCart, onToggleComponent, onUpdateQuantity, onSetVariant, onResetDefaults, onAddToCart } = data;
  const money = (amount: number) => formatMoney(amount, currencyCode);
  const typeLabel = bundle.bundleType === "mix_and_match" ? "Mix & match" : bundle.bundleType === "bogo" ? "Configurable" : "Bundle";
  const pricingLabel =
    bundle.pricingType === "fixed" ? "Fixed price" : bundle.pricingType === "percent_off" ? `${bundle.discountPercent ?? 0}% off` : bundle.pricingType === "amount_off" ? `${money(bundle.discountAmount ?? 0)} off` : "Sum of components";

  return (
    <Container data-slot="bundle-detail" className="flex flex-col gap-14 py-6 md:gap-20 md:py-10">
      <Breadcrumbs items={[{ label: "Bundles", to: "/bundles" }, { label: bundle.name }]} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16 lg:items-start">
        {/* Image */}
        <div className="relative overflow-hidden rounded-2xl bg-muted lg:sticky lg:top-28">
          <div className="aspect-[4/5] w-full">
            {bundle.images?.[0] ? (
              <img src={bundle.images[0]} alt={bundle.name} className="h-full w-full object-cover" loading="eager" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
                <p className="font-display text-2xl text-muted-foreground">
                  {bundle.components.length} {bundle.components.length === 1 ? "product" : "products"} in this bundle
                </p>
                <ul className="flex flex-wrap justify-center gap-2">
                  {bundle.components.map((component) => (
                    <li key={component._id}>
                      <Badge className="normal-case tracking-normal">
                        {component.product?.title ?? "Product"}
                        {component.quantity > 1 ? ` ×${component.quantity}` : ""}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {priceData && priceData.savingsPercent > 0 ? (
            <Badge tone="primary" className="absolute left-4 top-4">
              Save {priceData.savingsPercent}%
            </Badge>
          ) : null}
        </div>

        {/* Summary */}
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <SmallCaps className="text-primary">{typeLabel}</SmallCaps>
              <span className="text-muted-foreground/60" aria-hidden="true">
                ·
              </span>
              <SmallCaps className="capitalize">{bundle.status}</SmallCaps>
            </p>
            <h1 className="font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-5xl">{bundle.name}</h1>
            {bundle.shortDescription ? <p className="text-base leading-8 text-muted-foreground md:text-[17px]">{bundle.shortDescription}</p> : null}
          </div>

          <div className="flex flex-col gap-2">
            {priceData ? (
              <>
                <Price amount={priceData.bundlePrice} currency={currencyCode} compareAt={priceData.savings > 0 ? priceData.regularPrice : null} size="lg" />
                {priceData.savings > 0 ? (
                  <p className="text-sm text-primary">
                    You save {money(priceData.savings)} ({priceData.savingsPercent}% off)
                  </p>
                ) : null}
              </>
            ) : (
              <SkeletonBlock className="h-10 w-40" aria-hidden="true" />
            )}
          </div>

          {isConfigurable ? (
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-y border-border py-3 text-sm">
              <p className="text-muted-foreground">
                <span className="tabular-nums text-foreground">{totalSelectedItems}</span> {totalSelectedItems === 1 ? "item" : "items"} selected
                {bundle.minItems ? ` (min ${bundle.minItems})` : ""}
                {bundle.maxItems ? ` (max ${bundle.maxItems})` : ""}
                {!meetsMinItems ? <span className="ml-2 text-primary">Need {bundle.minItems! - totalSelectedItems} more</span> : null}
              </p>
              <button type="button" onClick={onResetDefaults} className="text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground">
                Reset to defaults
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button variant="primary" onClick={() => void onAddToCart()} disabled={!canAddToCart}>
              Add bundle to cart
            </Button>
            <Link to="/cart" className={buttonClasses("link")}>
              View cart
            </Link>
          </div>

          <ReceiptList>
            <ReceiptRow label="Type" value={bundle.bundleType === "mix_and_match" ? "Mix & match" : bundle.bundleType === "bogo" ? "Configurable" : "Fixed bundle"} />
            <ReceiptRow label="Pricing" value={pricingLabel} />
            <ReceiptRow label="Products" value={`${bundle.components.length} included`} />
            <ReceiptRow label="Slug" value={<span className="normal-case">{bundle.slug}</span>} />
          </ReceiptList>
        </div>
      </div>

      {/* Components */}
      <section className="flex flex-col gap-8">
        <SectionHeading
          level={2}
          title={isConfigurable ? "Choose your products" : "What's included"}
          lede={isConfigurable ? `Select the products you want in your bundle.${bundle.minItems ? ` Minimum ${bundle.minItems} items.` : ""}${bundle.maxItems ? ` Maximum ${bundle.maxItems} items.` : ""}` : undefined}
        />
        <ul className="flex flex-col divide-y divide-border border-y border-border" aria-label="Bundle components">
          {bundle.components.map((component) => {
            const price = unitPrice(component);
            const isSelected = isConfigurable ? selections.has(component._id) : true;
            const quantity = selections.get(component._id)?.quantity ?? component.quantity;
            const title = component.product?.title ?? "Product";
            return (
              <li key={component._id} className={cn("flex items-start gap-5 py-6 transition-opacity", isConfigurable && !isSelected && "opacity-70")}>
                {isConfigurable ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (component.isRequired) return;
                      onToggleComponent(component);
                    }}
                    disabled={component.isRequired}
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? "Remove" : "Add"} ${title}`}
                    className={cn(
                      "mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-transparent text-transparent hover:border-foreground/40",
                      component.isRequired ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                    )}
                  >
                    <Check className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}

                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex min-w-0 flex-col gap-1">
                      <h3 className="font-display text-xl leading-snug text-foreground">
                        {component.product?.slug ? (
                          <Link to="/products/$slug" params={{ slug: component.product.slug }} className="transition-colors hover:text-primary">
                            {title}
                          </Link>
                        ) : (
                          title
                        )}
                      </h3>
                      {component.label ? <p className="text-sm text-muted-foreground">{component.label}</p> : null}
                      {component.variant?.name ? <SmallCaps>Variant · {component.variant.name}</SmallCaps> : null}
                    </div>
                    {price > 0 ? (
                      <div className="flex shrink-0 flex-col items-end">
                        <span className="font-display text-lg tabular-nums text-foreground">{money(price)}</span>
                        {component.priceOverride != null ? <span className="text-xs tabular-nums text-muted-foreground line-through">{money(price)}</span> : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    {isConfigurable && isSelected ? (
                      <div className="inline-flex h-9 items-center rounded-full border border-border" role="group" aria-label={`${title} quantity`}>
                        <button type="button" onClick={() => onUpdateQuantity(component._id, -1)} aria-label={`Decrease ${title}`} className="flex h-full w-9 items-center justify-center rounded-l-full text-muted-foreground transition-colors hover:text-foreground">
                          <Minus className="size-3.5" aria-hidden="true" />
                        </button>
                        <span className="min-w-7 text-center text-sm font-semibold tabular-nums text-foreground">{quantity}</span>
                        <button type="button" onClick={() => onUpdateQuantity(component._id, 1)} aria-label={`Increase ${title}`} className="flex h-full w-9 items-center justify-center rounded-r-full text-muted-foreground transition-colors hover:text-foreground">
                          <Plus className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <SmallCaps className="tabular-nums">Qty {component.quantity}</SmallCaps>
                    )}

                    {component.allowVariantChange && component.variants && component.variants.length > 0 ? (
                      <label className="inline-flex items-center gap-2">
                        <SmallCaps>Variant</SmallCaps>
                        <UnderlineSelect value={selections.get(component._id)?.variantId ?? ""} onChange={(event) => onSetVariant(component._id, event.target.value || undefined)} aria-label={`${title} variant`} className="h-9 text-sm">
                          <option value="">Default variant</option>
                          {component.variants.map((variant) => (
                            <option key={variant._id} value={variant._id}>
                              {variant.title || variant.name || "Variant"}
                            </option>
                          ))}
                        </UnderlineSelect>
                      </label>
                    ) : null}

                    {component.isRequired ? <Badge>Required</Badge> : null}
                    {component.discountPercent != null && component.discountPercent > 0 ? <Badge tone="primary">-{component.discountPercent}%</Badge> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {bundle.description ? (
        <>
          <Rule />
          <Prose className="flex flex-col gap-6">
            <SectionHeading level={2} title="About this bundle" />
            <p className="whitespace-pre-wrap text-base leading-8 text-muted-foreground md:text-[17px]">{bundle.description}</p>
          </Prose>
        </>
      ) : null}
    </Container>
  );
}
