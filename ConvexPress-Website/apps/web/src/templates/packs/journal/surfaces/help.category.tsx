/**
 * Journal · help.category — breadcrumbs, the category as a display heading
 * with its description as the lede, and its articles as rule-separated rows
 * in the reading measure.
 */
import { Link } from "@tanstack/react-router";

import type { HelpCategorySurfaceData } from "@/templates/packs/core/surfaces/help.category";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, EmptyState, LinkButton, SectionHeading, SmallCaps } from "../parts";

export default function JournalHelpCategory({ data }: SurfaceProps<HelpCategorySurfaceData>) {
  const { categorySlug, category, articles } = data;

  if (!category) {
    return (
      <Container data-slot="help-category" className="py-6 md:py-10">
        <div className="mx-auto w-full max-w-3xl">
          <EmptyState
            eyebrow="Help centre"
            title="Category not found."
            action={
              <LinkButton to="/help" variant="ghost">
                Back to the help centre
              </LinkButton>
            }
          />
        </div>
      </Container>
    );
  }

  return (
    <Container data-slot="help-category" className="py-6 md:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <Breadcrumbs items={[{ label: "Help centre", to: "/help" }, { label: category.name }]} />
        <SectionHeading
          level={1}
          eyebrow="Help centre"
          title={
            <span className="flex items-baseline gap-4">
              {category.icon ? (
                <span className="text-3xl leading-none md:text-4xl" aria-hidden="true">
                  {category.icon}
                </span>
              ) : null}
              <span>{category.name}</span>
            </span>
          }
          lede={category.description ?? undefined}
          action={
            <SmallCaps className="tabular-nums">
              {category.articleCount} {category.articleCount === 1 ? "article" : "articles"}
            </SmallCaps>
          }
        />

        {articles.length === 0 ? (
          <EmptyState eyebrow="Nothing yet" title="No articles in this category yet." />
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {articles.map((article) => (
              <li key={article._id}>
                <Link to="/help/$categorySlug/$articleSlug" params={{ categorySlug, articleSlug: article.slug }} className="group flex flex-col gap-2 py-6 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="font-display text-2xl leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">{article.title}</span>
                    {article.excerpt ? <span className="line-clamp-2 text-base leading-7 text-muted-foreground">{article.excerpt}</span> : null}
                  </span>
                  {article.readingTimeMinutes ? <SmallCaps className="shrink-0 tabular-nums">{article.readingTimeMinutes} min read</SmallCaps> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
}
