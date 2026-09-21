import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { siteTitled } from "@/lib/seo/head";
import CoreBundlesIndex, {
  type BundlesIndexSurfaceData,
} from "@/templates/packs/core/surfaces/bundles.index";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/bundles/")({
  head: () => ({
    meta: [{ title: siteTitled("Product Bundles") }],
  }),
  component: BundlesIndexPage,
});

function BundlesIndexPage() {
  const { data: bundles } = useSuspenseQuery(convexQuery(api.commerceBundles.queries.listActive, {}));
  const currencyCode = bundles[0]?.currencyCode ?? "USD";

  const surfaceData: BundlesIndexSurfaceData = { bundles, currencyCode };

  return <Surface name="bundles.index" data={surfaceData} fallback={CoreBundlesIndex} />;
}
