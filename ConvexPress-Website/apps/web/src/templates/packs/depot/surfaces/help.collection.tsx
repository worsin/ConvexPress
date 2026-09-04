/**
 * Depot · help.collection — an ordered collection (series / learning path)
 * as a numbered data table: step, article (linked) with its excerpt, read
 * time. Not-found and empty states as in Core.
 */
import { Link } from "@tanstack/react-router";

import type { HelpCollectionSurfaceData } from "@/templates/packs/core/surfaces/help.collection";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, DataTable, EmptyState, Label, LinkButton, Td, Th } from "../parts";
import { PluginPageHeader } from "../parts/extra-plugins";

function collectionTypeLabel(type: string): string {
  if (type === "learningPath") return "in this learning path";
  if (type === "series") return "in this series";
  return "";
}

export default function DepotHelpCollection({ data }: SurfaceProps<HelpCollectionSurfaceData>) {
  const { collection } = data;

  if (!collection) {
    return (
      <Container padded={false} data-slot="help-collection" data-pack="depot" className="py-6 md:py-8">
        <EmptyState title="Collection not found" description="This collection does not exist or is not published." action={<LinkButton to="/help" variant="secondary">Back to Help Center</LinkButton>} />
      </Container>
    );
  }

  const articles = collection.articles ?? [];
  const count = collection.articleCount ?? articles.length;
  const suffix = collection.type ? collectionTypeLabel(collection.type) : "";

  return (
    <Container padded={false} data-slot="help-collection" data-pack="depot" className="flex flex-col gap-4 py-6 md:py-8">
      <Breadcrumbs items={[{ label: "Help Center", to: "/help" }, { label: "Collections" }, { label: collection.name }]} />
      <PluginPageHeader
        eyebrow={collection.type === "learningPath" ? "Learning path" : collection.type === "series" ? "Series" : "Collection"}
        title={collection.name}
        description={collection.description}
        aside={
          <Label className="tabular-nums">
            {count} {count === 1 ? "article" : "articles"}
            {suffix ? ` ${suffix}` : ""}
          </Label>
        }
      />

      {articles.length === 0 ? (
        <EmptyState title="No articles in this collection yet." />
      ) : (
        <DataTable caption={`Articles in ${collection.name}`}>
          <thead>
            <tr>
              <Th className="w-12">#</Th>
              <Th>Article</Th>
              <Th className="w-28 text-right">Read time</Th>
            </tr>
          </thead>
          <tbody>
            {articles.map((article, index) => (
              <tr key={article._id} className="border-t border-border">
                <Td className="tabular-nums text-muted-foreground">{index + 1}</Td>
                <Td>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Link to="/help/$categorySlug/$articleSlug" params={{ categorySlug: article.categorySlug ?? "uncategorized", articleSlug: article.slug }} className="text-sm font-semibold text-foreground hover:text-primary">
                      {article.title}
                    </Link>
                    {article.excerpt ? <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">{article.excerpt}</p> : null}
                  </div>
                </Td>
                <Td align="right" className="whitespace-nowrap text-muted-foreground">
                  {article.readingTimeMinutes ? `${article.readingTimeMinutes} min` : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Container>
  );
}
