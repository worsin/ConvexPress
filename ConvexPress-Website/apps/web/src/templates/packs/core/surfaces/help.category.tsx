import type { Id } from "@convexpress-website/backend/generated/dataModel";
/** Core · help.category — a knowledge base category and its published articles. */
import { Link } from "@tanstack/react-router";

import type { SurfaceProps } from "@/templates/sdk/types";

export type KbCategory = {
  _id: Id<"kb_categories">;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  articleCount: number;
};

export type KbArticleItem = {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string;
  readingTimeMinutes?: number;
};

export interface HelpCategorySurfaceData {
  /** Slug from the URL (used to build article links). */
  categorySlug: string;
  /** null when no published category matches the slug. */
  category: KbCategory | null;
  articles: KbArticleItem[];
  hasMore?: boolean;
}

export default function CoreHelpCategory({ data }: SurfaceProps<HelpCategorySurfaceData>) {
  const { categorySlug, category, articles: articleItems } = data;

  if (!category) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Category not found</h1>
        <Link
          to="/help"
          className="mt-4 inline-block text-primary hover:underline"
        >
          Back to Help Center
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/help" className="hover:text-foreground transition-colors">
          Help Center
        </Link>
        <span className="mx-2">/</span>
        <span>{category.name}</span>
      </nav>

      <h1 className="text-3xl font-bold">{category.name}</h1>
      {category.description && (
        <p className="mt-2 text-muted-foreground">{category.description}</p>
      )}

      <div className="mt-8 space-y-3">
        {articleItems.map((article) => (
          <Link
            key={article._id}
            to="/help/$categorySlug/$articleSlug"
            params={{ categorySlug, articleSlug: article.slug }}
            className="block rounded-lg border border-border bg-card p-4 transition hover:border-primary/50 hover:shadow-sm"
          >
            <h3 className="font-medium">{article.title}</h3>
            {article.excerpt && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {article.excerpt}
              </p>
            )}
            {article.readingTimeMinutes && (
              <p className="mt-2 text-xs text-muted-foreground">
                {article.readingTimeMinutes} min read
              </p>
            )}
          </Link>
        ))}
        {articleItems.length === 0 && !data.hasMore && (
          <p className="text-muted-foreground">
            No articles in this category yet.
          </p>
        )}
      </div>
    </div>
  );
}
