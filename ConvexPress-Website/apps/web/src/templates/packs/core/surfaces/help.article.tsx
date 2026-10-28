import type { Id } from "@convexpress-website/backend/generated/dataModel";
/** Core · help.article — knowledge base article reader: rendered body, outline, feedback and related articles. */
import { Link } from "@tanstack/react-router";

import { KbArticleBody } from "@/components/help/KbArticleBody";
import { KbArticleOutline, type KbOutlineEntry } from "@/components/help/KbArticleOutline";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { helpTrail } from "@/lib/help-trail";
import type { SurfaceProps } from "@/templates/sdk/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type KbArticle = {
  _id: Id<"kb_articles">;
  title: string;
  slug: string;
  /** The rendered body (backend kb/content/render.ts). */
  html?: string;
  outline?: KbOutlineEntry[];
  excerpt?: string;
  readingTimeMinutes?: number;
  publishedAt?: number;
  updatedAt?: number;
  author?: { _id: string; displayName: string; avatarUrl?: string } | null;
  category?: { _id: string; name: string; slug: string } | null;
  tags?: Array<{ _id: string; name: string; slug: string }>;
  relatedArticles?: Array<{ _id: string; title: string; slug: string; categorySlug?: string }>;
};

export type KbUserFeedback = { isHelpful?: boolean } | null | undefined;

export interface HelpArticleSurfaceData {
  /** Category slug from the URL (breadcrumb + related-article fallback). */
  categorySlug: string;
  /** null when no published article matches the slug. */
  article: KbArticle | null;
  /** The visitor's existing vote; undefined while loading / before a session id exists. */
  userFeedback: KbUserFeedback;
  actions: {
    /** Record a helpful / not-helpful vote. */
    sendFeedback: (isHelpful: boolean) => void;
  };
}

// ─── Article Reader ───────────────────────────────────────────────────────────

export default function CoreHelpArticle({ data }: SurfaceProps<HelpArticleSurfaceData>) {
  const { categorySlug, article: art, userFeedback, actions } = data;

  if (!art) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Article not found</h1>
        <Link
          to="/help"
          className="mt-4 inline-block text-primary hover:underline"
        >
          Back to Help Center
        </Link>
      </div>
    );
  }

  const alreadyVotedHelpful = userFeedback?.isHelpful === true;
  const alreadyVotedNotHelpful = userFeedback?.isHelpful === false;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Breadcrumbs
        className="mb-6"
        segments={helpTrail(
          ...(art.category ? [{ label: art.category.name, to: `/help/${categorySlug}` }] : []),
          { label: art.title },
        )}
      />

      {/* Article header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold leading-tight">{art.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {art.author && <span>By {art.author.displayName}</span>}
          {(art.updatedAt ?? art.publishedAt) && (
            <span>
              Updated {new Date(art.updatedAt ?? art.publishedAt!).toLocaleDateString()}
            </span>
          )}
          {art.readingTimeMinutes && (
            <span>{art.readingTimeMinutes} min read</span>
          )}
        </div>
      </header>

      {/* Article content */}
      <KbArticleOutline outline={art.outline} className="mb-8 rounded-lg border border-border bg-card p-4" />
      <article>
        <KbArticleBody html={art.html} className="text-foreground" />
      </article>

      {/* Helpful feedback widget */}
      <div className="mt-10 rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm font-medium">Was this article helpful?</p>
        <div className="mt-3 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => actions.sendFeedback(true)}
            className={[
              "rounded-lg border px-5 py-2 text-sm transition",
              alreadyVotedHelpful
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border bg-background hover:border-primary hover:text-primary",
            ].join(" ")}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => actions.sendFeedback(false)}
            className={[
              "rounded-lg border px-5 py-2 text-sm transition",
              alreadyVotedNotHelpful
                ? "border-destructive bg-destructive/10 text-destructive font-medium"
                : "border-border bg-background hover:border-destructive hover:text-destructive",
            ].join(" ")}
          >
            No
          </button>
        </div>
        {userFeedback && (
          <p className="mt-2 text-xs text-muted-foreground">
            Thanks for your feedback!
          </p>
        )}
      </div>

      {/* Related articles */}
      {art.relatedArticles && art.relatedArticles.length > 0 && (
        <section className="mt-12 border-t border-border pt-8">
          <h2 className="mb-4 text-xl font-semibold">Related Articles</h2>
          <div className="space-y-3">
            {art.relatedArticles.map((related) => (
              <Link
                key={related._id}
                to="/help/$categorySlug/$articleSlug"
                params={{ categorySlug: related.categorySlug ?? categorySlug, articleSlug: related.slug }}
                className="block text-primary hover:underline"
              >
                {related.title}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
