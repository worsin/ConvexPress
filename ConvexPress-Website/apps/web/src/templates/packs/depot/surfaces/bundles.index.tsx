/**
 * Depot · bundles.index — the bundle catalog as a dense card grid (image or
 * component chips, type badge, name, one-line description, price with the
 * regular price struck through, "Save n%" badge), then a comparison table
 * of every bundle: type, products, regular price, bundle price, savings.
 */
import { Link } from "@tanstack/react-router";
import { Package } from "lucide-react";

import { formatMoney } from "@/lib/commerce/format";
import type { BundleListItem, BundlesIndexSurfaceData } from "@/templates/packs/core/surfaces/bundles.index";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Card, Container, DataTable, EmptyState, Label, Price, SectionHeading, Td, Th } from "../parts";
import { PageHeader } from "../parts/extra-commerce";

const GRID = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

function typeLabel(bundleType: string) {
  return bundleType === "mix_and_match" ? "Mix & Match" : bundleType === "bogo" ? "BOGO" : "Bundle";
}

function savingsOf(bundle: BundleListItem) {
  const savings = typeof bundle.regularPrice === "number" && typeof bundle.bundlePrice === "number" && bundle.regularPrice > bundle.bundlePrice ? bundle.regularPrice - bundle.bundlePrice : 0;
  const percent = savings > 0 && bundle.regularPrice ? Math.round((savings / bundle.regularPrice) * 100) : 0;
  return { savings, percent };
}

export default function DepotBundlesIndex({ data }: SurfaceProps<BundlesIndexSurfaceData>) {
  const { bundles, currencyCode } = data;
  const money = (amount: number, currency = currencyCode) => formatMoney(amount, currency);

  return (
    <Container padded={false} data-slot="bundles-index" className="flex flex-col gap-6 py-6 md:py-8">
      <PageHeader label="Bundles" title="Save more with curated product bundles" description="Handpicked combinations at special prices. Buy together and get more value from every order." meta={bundles.length > 0 ? `${bundles.length} ${bundles.length === 1 ? "bundle" : "bundles"} available` : undefined} />

      {bundles.length === 0 ? (
        <EmptyState title="No bundles are available right now." description="Check back soon." />
      ) : (
        <>
          <div className={GRID}>
            {bundles.map((bundle) => (
              <BundleCard key={bundle._id} bundle={bundle} currencyCode={bundle.currencyCode} />
            ))}
          </div>

          <section className="flex flex-col gap-3" aria-label="Compare bundles">
            <SectionHeading title="Compare bundles" count={bundles.length} />
            <DataTable caption="Bundle comparison">
              <thead>
                <tr>
                  <Th>Bundle</Th>
                  <Th className="hidden md:table-cell">Type</Th>
                  <Th>Products</Th>
                  <Th className="hidden text-right sm:table-cell">Regular</Th>
                  <Th className="text-right">Bundle price</Th>
                  <Th className="text-right">Savings</Th>
                </tr>
              </thead>
              <tbody>
                {bundles.map((bundle) => {
                  const { savings, percent } = savingsOf(bundle);
                  return (
                    <tr key={bundle._id} className="border-t border-border">
                      <Td>
                        <Link to="/bundles/$slug" params={{ slug: bundle.slug }} className="text-sm font-semibold text-foreground hover:text-primary">
                          {bundle.name}
                        </Link>
                      </Td>
                      <Td className="hidden md:table-cell">
                        <Badge tone="new">{typeLabel(bundle.bundleType)}</Badge>
                      </Td>
                      <Td className="tabular-nums">
                        {bundle.components.length}
                        <span className="hidden text-muted-foreground lg:inline">
                          {" · "}
                          {bundle.components
                            .slice(0, 3)
                            .map((component) => `${component.product?.title ?? "Product"}${component.quantity > 1 ? ` x${component.quantity}` : ""}`)
                            .join(", ")}
                          {bundle.components.length > 3 ? ` +${bundle.components.length - 3} more` : ""}
                        </span>
                      </Td>
                      <Td align="right" className="hidden text-muted-foreground sm:table-cell">
                        {typeof bundle.regularPrice === "number" ? money(bundle.regularPrice, bundle.currencyCode) : "—"}
                      </Td>
                      <Td align="right" className="font-semibold text-foreground">
                        {typeof bundle.bundlePrice === "number" ? money(bundle.bundlePrice, bundle.currencyCode) : typeof bundle.regularPrice === "number" ? money(bundle.regularPrice, bundle.currencyCode) : "Varies"}
                      </Td>
                      <Td align="right">{savings > 0 ? <span className="font-semibold text-primary">{money(savings)} ({percent}%)</span> : <span className="text-muted-foreground">—</span>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </section>
        </>
      )}
    </Container>
  );
}

function BundleCard({ bundle, currencyCode }: { bundle: BundleListItem; currencyCode: string }) {
  const { savings, percent } = savingsOf(bundle);
  const image = bundle.images?.[0];
  return (
    <Card as="article" className="group flex flex-col overflow-hidden transition-colors hover:border-primary/50">
      <Link to="/bundles/$slug" params={{ slug: bundle.slug }} className="flex flex-1 flex-col">
        <div className="relative aspect-square bg-muted/40">
          {image ? (
            <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
              <Package className="size-8 text-muted-foreground" aria-hidden="true" />
              <Label>
                {bundle.components.length} {bundle.components.length === 1 ? "product" : "products"}
              </Label>
              <div className="flex flex-wrap justify-center gap-1">
                {bundle.components.slice(0, 4).map((component) => (
                  <Badge key={component._id} tone="stock" className="normal-case tracking-normal">
                    {component.product?.title ?? "Product"}
                    {component.quantity > 1 ? ` x${component.quantity}` : ""}
                  </Badge>
                ))}
                {bundle.components.length > 4 && (
                  <Badge tone="stock" className="normal-case tracking-normal">
                    +{bundle.components.length - 4} more
                  </Badge>
                )}
              </div>
            </div>
          )}
          {percent > 0 && (
            <Badge tone="sale" className="absolute left-2 top-2">
              Save {percent}%
            </Badge>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-3">
          <Label>{typeLabel(bundle.bundleType)}</Label>
          <h2 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground group-hover:text-primary">{bundle.name}</h2>
          {bundle.shortDescription ? <p className="line-clamp-1 text-[13px] text-muted-foreground">{bundle.shortDescription}</p> : null}
          <div className="mt-auto pt-1">
            {typeof bundle.bundlePrice === "number" ? (
              <Price amount={bundle.bundlePrice} compareAt={savings > 0 ? bundle.regularPrice : null} currency={currencyCode} />
            ) : (
              <Price amount={bundle.regularPrice} label={typeof bundle.regularPrice === "number" ? undefined : "Price varies"} currency={currencyCode} />
            )}
          </div>
        </div>
      </Link>
    </Card>
  );
}
