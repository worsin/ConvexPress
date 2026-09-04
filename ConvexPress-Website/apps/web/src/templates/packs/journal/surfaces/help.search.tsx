/**
 * Journal · help.search — breadcrumbs, one underline search line, the result
 * count in small caps, and results as rule-separated rows in the reading
 * measure. Same states as Core: no query yet, no matches, results.
 */
import { Link } from "@tanstack/react-router";
import type { FormEvent } from "react";

import type { HelpSearchSurfaceData } from "@/templates/packs/core/surfaces/help.search";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, EmptyState, LinkButton, SmallCaps } from "../parts";
import { SearchLine } from "../parts/content";

export default function JournalHelpSearch({ data }: SurfaceProps<HelpSearchSurfaceData>) {
  const { q, hasQuery, results, total, actions } = data;

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get("q") as string;
    actions.search(query);
  }

  return (
    <Container data-slot="help-search" className="py-6 md:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <Breadcrumbs items={[{ label: "Help centre", to: "/help" }, { label: "Search" }]} />

        <header className="flex flex-col gap-6">
          <h1 className="font-display text-4xl leading-[1.02] tracking-tight text-foreground md:text-5xl">
            {hasQuery ? (
              <>
                Results for <span className="text-primary">“{q}”</span>
              </>
            ) : (
              "Search the help centre"
            )}
          </h1>
          <form onSubmit={handleSearchSubmit} role="search" className="w-full max-w-xl">
            <SearchLine id="help-search" label="Search articles" placeholder="Search articles…" defaultValue={q ?? ""} autoFocus={!hasQuery} />
          </form>
        </header>

        {hasQuery ? (
          <SmallCaps as="p" className="tabular-nums" aria-live="polite">
            {total} {total === 1 ? "result" : "results"}
          </SmallCaps>
        ) : null}

        {results.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {results.map((article) => (
              <li key={article._id}>
                <Link to="/help/$categorySlug/$articleSlug" params={{ categorySlug: article.categorySlug ?? "uncategorized", articleSlug: article.slug }} className="group flex flex-col gap-2 py-6">
                  {article.categoryName ? <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">{article.categoryName}</span> : null}
                  <span className="font-display text-2xl leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">{article.title}</span>
                  {article.excerpt ? <span className="line-clamp-2 text-base leading-7 text-muted-foreground">{article.excerpt}</span> : null}
                  {article.readingTimeMinutes ? <SmallCaps className="tabular-nums">{article.readingTimeMinutes} min read</SmallCaps> : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {hasQuery && results.length === 0 ? (
          <EmptyState
            eyebrow="No results"
            title="No articles found. Try different keywords."
            action={
              <LinkButton to="/help" variant="ghost">
                Browse by category
              </LinkButton>
            }
          />
        ) : null}

        {!hasQuery ? <p className="border-t border-border pt-8 text-center text-sm text-muted-foreground">Enter a search term to find articles in our knowledge base.</p> : null}
      </div>
    </Container>
  );
}
