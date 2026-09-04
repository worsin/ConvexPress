/**
 * Depot · help.home — the help center as a searchable card grid: a search
 * bar in the page header, categories four-up with article counts, featured
 * articles four-up. Same links and empty states as Core.
 */
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";

import type { HelpHomeSurfaceData } from "@/templates/packs/core/surfaces/help.home";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Card, Container, EmptyState, Label, SectionHeading } from "../parts";
import { Input } from "../parts/extra-plugins";

export default function DepotHelpHome({ data }: SurfaceProps<HelpHomeSurfaceData>) {
  const { categories, featured, actions } = data;

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get("q") as string;
    actions.search(query);
  }

  return (
    <Container padded={false} data-slot="help-home" data-pack="depot" className="flex flex-col gap-6 py-6 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-col gap-1">
          <Label>Help center</Label>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">How can we help?</h1>
          <p className="text-[13px] leading-5 text-muted-foreground">Search the knowledge base or browse by category.</p>
        </div>
        <form role="search" onSubmit={handleSearchSubmit} className="flex w-full gap-2 md:w-auto md:min-w-96">
          <label className="sr-only" htmlFor="help-home-search">
            Search articles
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="help-home-search" name="q" type="text" placeholder="Search articles..." className="pl-9" />
          </div>
          <Button type="submit">Search</Button>
        </form>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeading title="Browse by category" count={categories.length > 0 ? categories.length : undefined} />
        {categories && categories.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {categories.map((category) => (
              <Card key={category._id} className="transition-colors hover:border-primary/60">
                <Link to="/help/$categorySlug" params={{ categorySlug: category.slug }} className="flex h-full flex-col gap-1.5 p-3">
                  <div className="flex items-center gap-2">
                    {category.icon ? (
                      <span className="text-lg leading-none" aria-hidden="true">
                        {category.icon}
                      </span>
                    ) : null}
                    <h3 className="text-sm font-semibold text-foreground">{category.name}</h3>
                  </div>
                  {category.description ? <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">{category.description}</p> : null}
                  <Label className="mt-auto pt-1 tabular-nums">
                    {category.articleCount} {category.articleCount === 1 ? "article" : "articles"}
                  </Label>
                </Link>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title="No categories yet." />
        )}
      </section>

      {featured && featured.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading title="Featured articles" action={{ label: "Search all", to: "/help/search" }} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {featured.map((article) => (
              <Card key={article._id} className="transition-colors hover:border-primary/60">
                <Link to="/help/$categorySlug/$articleSlug" params={{ categorySlug: article.categorySlug ?? "uncategorized", articleSlug: article.slug }} className="flex h-full flex-col gap-1.5 p-3">
                  <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{article.title}</h3>
                  {article.excerpt ? <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">{article.excerpt}</p> : null}
                  {article.readingTimeMinutes ? <Label className="mt-auto pt-1">{article.readingTimeMinutes} min read</Label> : null}
                </Link>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </Container>
  );
}
