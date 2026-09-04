/**
 * Journal · help.collection — an ordered series or learning path: breadcrumbs,
 * display heading with the description as lede, the count in small caps, and
 * the articles as numbered rule-separated rows (the number in display type).
 */
import { Link } from "@tanstack/react-router";

import type { HelpCollectionSurfaceData } from "@/templates/packs/core/surfaces/help.collection";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, EmptyState, LinkButton, SectionHeading, SmallCaps } from "../parts";

function collectionTypeLabel(type: string): string {
  if (type === "learningPath") return "in this learning path";
  if (type === "series") return "in this series";
  return "";
}

export default function JournalHelpCollection({ data }: SurfaceProps<HelpCollectionSurfaceData>) {
  const { collection } = data;

  if (!collection) {
    return (
      <Container data-slot="help-collection" className="py-6 md:py-10">
        <div className="mx-auto w-full max-w-3xl">
          <EmptyState
            eyebrow="Help centre"
            title="Collection not found."
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

  const articles = collection.articles ?? [];
  const count = collection.articleCount ?? articles.length;
  const typeLabel = collection.type ? collectionTypeLabel(collection.type) : "";

  return (
    <Container data-slot="help-collection" className="py-6 md:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <Breadcrumbs items={[{ label: "Help centre", to: "/help" }, { label: "Collections" }, { label: collection.name }]} />
        <SectionHeading
          level={1}
          eyebrow={collection.type === "learningPath" ? "Learning path" : collection.type === "series" ? "Series" : "Collection"}
          title={collection.name}
          lede={collection.description ?? undefined}
          action={
            <SmallCaps className="tabular-nums">
              {count} {count === 1 ? "article" : "articles"}
              {typeLabel ? ` ${typeLabel}` : ""}
            </SmallCaps>
          }
        />

        {articles.length === 0 ? (
          <EmptyState eyebrow="Nothing yet" title="No articles in this collection yet." />
        ) : (
          <ol className="flex flex-col divide-y divide-border border-y border-border">
            {articles.map((article, index) => (
              <li key={article._id}>
                <Link to="/help/$categorySlug/$articleSlug" params={{ categorySlug: article.categorySlug ?? "uncategorized", articleSlug: article.slug }} className="group grid grid-cols-[3rem_minmax(0,1fr)] gap-4 py-6 sm:gap-6">
                  <span className="font-display text-2xl leading-none tabular-nums text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="font-display text-2xl leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
                      <span className="sr-only">Step {index + 1}: </span>
                      {article.title}
                    </span>
                    {article.excerpt ? <span className="line-clamp-2 text-base leading-7 text-muted-foreground">{article.excerpt}</span> : null}
                    {article.readingTimeMinutes ? <SmallCaps className="tabular-nums">{article.readingTimeMinutes} min read</SmallCaps> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Container>
  );
}
