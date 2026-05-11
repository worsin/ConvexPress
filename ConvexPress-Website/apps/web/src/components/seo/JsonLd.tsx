/**
 * JsonLd - Renders a Schema.org JSON-LD script tag.
 *
 * Takes an array of Schema.org graph objects and renders them as a
 * properly formatted <script type="application/ld+json"> tag.
 *
 * This is a standalone component for cases where you want to add
 * JSON-LD without the full SeoHead component (e.g., adding
 * BreadcrumbList to an archive page that already has meta tags).
 *
 * Usage:
 *   <JsonLd graph={[websiteSchema, organizationSchema, articleSchema]} />
 */

import type { JsonLdProps } from "@/lib/seo/types";
import { serializeJsonLd, wrapJsonLdGraph } from "@/lib/seo/jsonld";

export function JsonLd({ graph }: JsonLdProps) {
  if (!graph || graph.length === 0) return null;

  const jsonLdString = serializeJsonLd(wrapJsonLdGraph(graph));

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdString }}
    />
  );
}
