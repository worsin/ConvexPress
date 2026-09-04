/** Core · help.collection — an ordered knowledge base collection (series / learning path). */
import { Link } from "@tanstack/react-router";

import type { SurfaceProps } from "@/templates/sdk/types";

export type KbCollectionArticle = {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string;
  readingTimeMinutes?: number;
  categorySlug?: string;
  order: number;
};

export type KbCollection = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  type?: string;
  articleCount?: number;
  articles: KbCollectionArticle[];
};

export interface HelpCollectionSurfaceData {
  /** null when no published collection matches the slug. */
  collection: KbCollection | null;
}

function collectionTypeLabel(type: string): string {
  if (type === "learningPath") return "in this learning path";
  if (type === "series") return "in this series";
  return "";
}

export default function CoreHelpCollection({ data }: SurfaceProps<HelpCollectionSurfaceData>) {
  const { collection } = data;

  if (!collection) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Collection not found</h1>
        <Link
          to="/help"
          className="mt-4 inline-block text-primary hover:underline"
        >
          Back to Help Center
        </Link>
      </div>
    );
  }

  const col = collection;
  const articles = col.articles ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/help" className="hover:text-foreground transition-colors">
          Help Center
        </Link>
        <span className="mx-2">/</span>
        <span className="hover:text-foreground transition-colors">
          Collections
        </span>
        <span className="mx-2">/</span>
        <span className="text-foreground">{col.name}</span>
      </nav>

      {/* Collection header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold">{col.name}</h1>
        {col.description && (
          <p className="mt-2 text-muted-foreground">{col.description}</p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          {col.articleCount ?? articles.length}{" "}
          {(col.articleCount ?? articles.length) === 1 ? "article" : "articles"}
          {col.type && collectionTypeLabel(col.type)
            ? ` ${collectionTypeLabel(col.type)}`
            : ""}
        </p>
      </header>

      {/* Article list */}
      <div className="space-y-3">
        {articles.map((article, index: number) => (
          <Link
            key={article._id}
            to="/help/$categorySlug/$articleSlug"
            params={{
              categorySlug: article.categorySlug ?? "uncategorized",
              articleSlug: article.slug,
            }}
            className="flex items-start gap-4 rounded-lg border border-border bg-card p-4 transition hover:border-primary/50 hover:shadow-sm"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
              {index + 1}
            </span>
            <div className="min-w-0">
              <h3 className="font-medium">{article.title}</h3>
              {article.excerpt && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {article.excerpt}
                </p>
              )}
              {article.readingTimeMinutes && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {article.readingTimeMinutes} min read
                </p>
              )}
            </div>
          </Link>
        ))}
        {articles.length === 0 && (
          <p className="text-muted-foreground">
            No articles in this collection yet.
          </p>
        )}
      </div>
    </div>
  );
}
