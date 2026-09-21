/**
 * Depot · help.category — a knowledge base category: breadcrumb, page header
 * with the description, articles as a card grid. Not-found and empty states
 * as in Core.
 */
import { Link } from "@tanstack/react-router";

import type { HelpCategorySurfaceData } from "@/templates/packs/core/surfaces/help.category";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Card, Container, EmptyState, Label, LinkButton } from "../parts";
import { PluginPageHeader } from "../parts/extra-plugins";

export default function DepotHelpCategory({ data }: SurfaceProps<HelpCategorySurfaceData>) {
  const { categorySlug, category, articles } = data;

  if (!category) {
    return (
      <Container padded={false} data-slot="help-category" data-pack="depot" className="py-6 md:py-8">
        <EmptyState title="Category not found" description="This help category does not exist or is not published." action={<LinkButton to="/help" variant="secondary">Back to Help Center</LinkButton>} />
      </Container>
    );
  }

  return (
    <Container padded={false} data-slot="help-category" data-pack="depot" className="flex flex-col gap-4 py-6 md:py-8">
      <Breadcrumbs items={[{ label: "Help Center", to: "/help" }, { label: category.name }]} />
      <PluginPageHeader eyebrow="Help center" title={category.name} description={category.description} aside={<Label className="tabular-nums">{articles.length} {articles.length === 1 ? "article" : "articles"}</Label>} />

      {articles.length === 0 && !data.hasMore ? (
        <EmptyState title="No articles in this category yet." action={<LinkButton to="/help" variant="secondary" size="sm">Back to Help Center</LinkButton>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {articles.map((article) => (
            <Card key={article._id} className="transition-colors hover:border-primary/60">
              <Link to="/help/$categorySlug/$articleSlug" params={{ categorySlug, articleSlug: article.slug }} className="flex h-full flex-col gap-1.5 p-3">
                <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{article.title}</h3>
                {article.excerpt ? <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">{article.excerpt}</p> : null}
                {article.readingTimeMinutes ? <Label className="mt-auto pt-1">{article.readingTimeMinutes} min read</Label> : null}
              </Link>
            </Card>
          ))}
        </div>
      )}
    </Container>
  );
}
