/**
 * Aster · help.home — the help centre as a front page: a centred display
 * heading with one underline search line, categories as a two-column list of
 * rule-separated rows, and featured articles as rule-separated rows below.
 */
import { Link } from "@tanstack/react-router";
import type { FormEvent } from "react";

import type { HelpHomeSurfaceData } from "@/templates/packs/core/surfaces/help.home";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, Rule, SectionHeading, SmallCaps } from "../parts";
import { SearchLine } from "../parts/extra-plugins";

export default function AsterHelpHome({ data }: SurfaceProps<HelpHomeSurfaceData>) {
  const { categories, featured, actions } = data;

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get("q") as string;
    actions.search(query);
  }

  return (
    <Container data-slot="help-home" className="flex flex-col gap-14 py-6 md:gap-20 md:py-10">
      <header className="flex flex-col items-center gap-8">
        <SectionHeading level={1} align="center" eyebrow="Help centre" title="How can we help?" lede="Search the knowledge base or browse by category." />
        <form onSubmit={handleSearchSubmit} role="search" className="w-full max-w-xl">
          <SearchLine id="help-home-search" label="Search articles" placeholder="Search articles…" />
        </form>
      </header>

      <section className="flex flex-col gap-8">
        <Rule />
        <SectionHeading title="Browse by category" />
        {categories && categories.length > 0 ? (
          <ul className="grid gap-x-10 md:grid-cols-2">
            {categories.map((category) => (
              <li key={category._id} className="border-b border-border">
                <Link to="/help/$categorySlug" params={{ categorySlug: category.slug }} className="group flex items-start gap-4 py-6">
                  {category.icon ? (
                    <span className="mt-0.5 w-8 shrink-0 text-2xl leading-none" aria-hidden="true">
                      {category.icon}
                    </span>
                  ) : null}
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="font-display text-xl leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">{category.name}</span>
                    {category.description ? <span className="line-clamp-2 text-sm leading-6 text-muted-foreground">{category.description}</span> : null}
                    <SmallCaps className="tabular-nums">
                      {category.articleCount} {category.articleCount === 1 ? "article" : "articles"}
                    </SmallCaps>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState eyebrow="Nothing yet" title="No categories yet." />
        )}
      </section>

      {featured && featured.length > 0 ? (
        <section className="flex flex-col gap-8">
          <Rule />
          <SectionHeading title="Featured articles" />
          <ul className="flex flex-col divide-y divide-border border-b border-border">
            {featured.map((article) => (
              <li key={article._id}>
                <Link to="/help/$categorySlug/$articleSlug" params={{ categorySlug: article.categorySlug ?? "uncategorized", articleSlug: article.slug }} className="group flex flex-col gap-2 py-6 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="font-display text-xl leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">{article.title}</span>
                    {article.excerpt ? <span className="line-clamp-2 text-sm leading-6 text-muted-foreground">{article.excerpt}</span> : null}
                  </span>
                  {article.readingTimeMinutes ? <SmallCaps className="shrink-0 tabular-nums">{article.readingTimeMinutes} min read</SmallCaps> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Container>
  );
}
