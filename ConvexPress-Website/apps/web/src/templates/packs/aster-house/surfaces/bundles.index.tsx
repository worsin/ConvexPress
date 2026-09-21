/**
 * Aster · bundles.index — bundles as a three-up boutique grid: a 4:5
 * image (or the component names when there is none), the type in small
 * caps, the name in display type, one line of description, the bundle price
 * with the regular price struck through. Same links and savings maths as
 * Core.
 */
import { Link } from "@tanstack/react-router";

import type { BundleListItem, BundlesIndexSurfaceData } from "@/templates/packs/core/surfaces/bundles.index";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Container, EmptyState, LinkButton, Price, SectionHeading, SmallCaps } from "../parts";

function typeLabel(bundleType: string) {
  return bundleType === "mix_and_match" ? "Mix & match" : bundleType === "bogo" ? "BOGO" : "Bundle";
}

export default function AsterBundlesIndex({ data }: SurfaceProps<BundlesIndexSurfaceData>) {
  const { bundles } = data;

  return (
    <Container as="section" data-slot="bundles-index" className="flex flex-col gap-14 py-6 md:gap-20 md:py-10">
      <SectionHeading
        level={1}
        eyebrow="Bundles"
        title="Save more with curated bundles."
        lede="Handpicked combinations at special prices. Buy together and get more value from every order."
        action={
          bundles.length > 0 ? (
            <SmallCaps className="tabular-nums">
              {bundles.length} {bundles.length === 1 ? "bundle" : "bundles"}
            </SmallCaps>
          ) : undefined
        }
      />

      {bundles.length === 0 ? (
        <EmptyState
          eyebrow="Nothing yet"
          title="No bundles are available right now. Check back soon."
          action={
            <LinkButton to="/products" variant="ghost">
              Browse products
            </LinkButton>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {bundles.map((bundle) => (
            <BundleCard key={bundle._id} bundle={bundle} currencyCode={bundle.currencyCode} />
          ))}
        </div>
      )}
    </Container>
  );
}

function BundleCard({ bundle, currencyCode }: { bundle: BundleListItem; currencyCode: string }) {
  const hasBundlePrice = typeof bundle.bundlePrice === "number";
  const hasRegular = typeof bundle.regularPrice === "number";
  const savings = hasRegular && hasBundlePrice && bundle.regularPrice! > bundle.bundlePrice! ? bundle.regularPrice! - bundle.bundlePrice! : 0;
  const savingsPercent = savings > 0 && bundle.regularPrice ? Math.round((savings / bundle.regularPrice) * 100) : 0;
  const components = bundle.components;

  return (
    <article data-slot="aster-bundle-card" className="group flex flex-col gap-4">
      <Link to="/bundles/$slug" params={{ slug: bundle.slug }} className="relative block overflow-hidden rounded-2xl bg-muted" aria-label={bundle.name}>
        <div className="aspect-[4/5] w-full">
          {bundle.images?.[0] ? (
            <img src={bundle.images[0]} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" loading="lazy" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              <span className="font-display text-lg text-muted-foreground">
                {components.length} {components.length === 1 ? "product" : "products"}
              </span>
              <ul className="flex flex-wrap justify-center gap-1.5">
                {components.slice(0, 4).map((component) => (
                  <li key={component._id}>
                    <Badge className="normal-case tracking-normal">
                      {component.product?.title ?? "Product"}
                      {component.quantity > 1 ? ` ×${component.quantity}` : ""}
                    </Badge>
                  </li>
                ))}
                {components.length > 4 ? (
                  <li>
                    <Badge className="normal-case tracking-normal">+{components.length - 4} more</Badge>
                  </li>
                ) : null}
              </ul>
            </div>
          )}
        </div>
        {savingsPercent > 0 ? (
          <Badge tone="primary" className="absolute left-3 top-3">
            Save {savingsPercent}%
          </Badge>
        ) : null}
      </Link>
      <div className="flex flex-col gap-1.5">
        <SmallCaps>{typeLabel(bundle.bundleType)}</SmallCaps>
        <h2 className="font-display text-xl leading-snug tracking-tight text-foreground">
          <Link to="/bundles/$slug" params={{ slug: bundle.slug }} className="transition-colors hover:text-primary">
            {bundle.name}
          </Link>
        </h2>
        {bundle.shortDescription ? <p className="line-clamp-1 text-sm leading-6 text-muted-foreground">{bundle.shortDescription}</p> : null}
        <div className="mt-1">
          {hasBundlePrice ? (
            <Price amount={bundle.bundlePrice} currency={currencyCode} compareAt={savings > 0 ? bundle.regularPrice : null} size="sm" />
          ) : (
            <Price amount={hasRegular ? bundle.regularPrice : undefined} label={hasRegular ? undefined : "Price varies"} currency={currencyCode} size="sm" />
          )}
        </div>
      </div>
    </article>
  );
}
