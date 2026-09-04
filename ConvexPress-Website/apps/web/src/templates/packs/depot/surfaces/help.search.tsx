/**
 * Depot · help.search — knowledge base search: breadcrumb, a search bar row,
 * the count, results as a card grid. Empty and idle states as in Core.
 */
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";

import type { HelpSearchSurfaceData } from "@/templates/packs/core/surfaces/help.search";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Button, Card, Container, EmptyState, Label, SectionHeading } from "../parts";
import { Input } from "../parts/extra-plugins";

export default function DepotHelpSearch({ data }: SurfaceProps<HelpSearchSurfaceData>) {
  const { q, hasQuery, results, total, actions } = data;

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get("q") as string;
    actions.search(query);
  }

  return (
    <Container padded={false} data-slot="help-search" data-pack="depot" className="flex flex-col gap-4 py-6 md:py-8">
      <Breadcrumbs items={[{ label: "Help Center", to: "/help" }, { label: "Search" }]} />

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-col gap-1">
          <Label>Help center</Label>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Search articles</h1>
        </div>
        <form role="search" onSubmit={handleSearchSubmit} className="flex w-full gap-2 md:w-auto md:min-w-96">
          <label className="sr-only" htmlFor="help-search-input">
            Search articles
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="help-search-input" name="q" type="text" defaultValue={q ?? ""} placeholder="Search articles..." className="pl-9" autoFocus={!hasQuery} />
          </div>
          <Button type="submit">Search</Button>
        </form>
      </div>

      {hasQuery ? (
        <SectionHeading
          title="Results"
          count={
            <>
              {total} {total === 1 ? "result" : "results"} for &ldquo;{q}&rdquo;
            </>
          }
          action={{ label: "Browse categories", to: "/help" }}
        />
      ) : null}

      {results.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {results.map((article) => (
            <Card key={article._id} className="transition-colors hover:border-primary/60">
              <Link to="/help/$categorySlug/$articleSlug" params={{ categorySlug: article.categorySlug ?? "uncategorized", articleSlug: article.slug }} className="flex h-full flex-col gap-1.5 p-3">
                {article.categoryName ? <Label className="text-primary">{article.categoryName}</Label> : null}
                <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{article.title}</h3>
                {article.excerpt ? <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">{article.excerpt}</p> : null}
                {article.readingTimeMinutes ? <Label className="mt-auto pt-1">{article.readingTimeMinutes} min read</Label> : null}
              </Link>
            </Card>
          ))}
        </div>
      ) : null}

      {hasQuery && results.length === 0 ? (
        <EmptyState
          title="No articles found"
          description={
            <>
              Try different keywords or{" "}
              <Link to="/help" className="font-medium text-primary hover:underline">
                browse by category
              </Link>
              .
            </>
          }
        />
      ) : null}

      {!hasQuery ? <EmptyState title="Search the knowledge base" description="Enter a search term to find articles in our knowledge base." /> : null}
    </Container>
  );
}
