import type { Id } from "@convexpress-website/backend/generated/dataModel";
/** Core · help.article — knowledge base article reader: rendered body, outline, feedback and related articles. */
import { Link } from "@tanstack/react-router";
import { useState } from "react";

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

export type KbUserFeedback = { isHelpful?: boolean; reason?: KbFeedbackReason } | null | undefined;
export type KbFeedbackReason = "outdated" | "incorrect" | "unclear" | "incomplete" | "other";

export interface HelpArticleSurfaceData {
  /** Category slug from the URL (breadcrumb + related-article fallback). */
  categorySlug: string;
  /** null when no published article matches the slug. */
  article: KbArticle | null;
  /** The visitor's existing vote; undefined while loading / before a session id exists. */
  userFeedback: KbUserFeedback;
  actions: {
    /** Record a helpful / not-helpful vote; a "no" may say why. */
    sendFeedback: (isHelpful: boolean, details?: { reason?: KbFeedbackReason; comment?: string }) => void;
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

      <FeedbackWidget userFeedback={userFeedback} send={actions.sendFeedback} />

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

const REASONS: Array<{ value: KbFeedbackReason; label: string }> = [
  { value: "outdated", label: "It's out of date" },
  { value: "incorrect", label: "Something's wrong" },
  { value: "unclear", label: "Hard to follow" },
  { value: "incomplete", label: "It didn't cover my question" },
  { value: "other", label: "Something else" },
];

function FeedbackWidget({ userFeedback, send }: { userFeedback: KbUserFeedback; send: HelpArticleSurfaceData["actions"]["sendFeedback"] }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<KbFeedbackReason | null>(null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const votedYes = userFeedback?.isHelpful === true;
  const votedNo = userFeedback?.isHelpful === false;
  const button = (active: boolean, tone: "primary" | "destructive") =>
    [
      "rounded-lg border px-5 py-2 text-sm transition",
      active
        ? tone === "primary"
          ? "border-primary bg-primary/10 text-primary font-medium"
          : "border-destructive bg-destructive/10 text-destructive font-medium"
        : `border-border bg-background ${tone === "primary" ? "hover:border-primary hover:text-primary" : "hover:border-destructive hover:text-destructive"}`,
    ].join(" ");

  return (
    <div className="mt-10 rounded-lg border border-border bg-card p-6 text-center">
      <p className="text-sm font-medium">Was this article helpful?</p>
      <div className="mt-3 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => {
            setAsking(false);
            send(true);
          }}
          className={button(votedYes, "primary")}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => {
            setAsking(true);
            setSent(false);
            send(false);
          }}
          className={button(votedNo || asking, "destructive")}
        >
          No
        </button>
      </div>
      {asking && !sent ? (
        <form
          className="mx-auto mt-4 max-w-md space-y-3 text-left"
          onSubmit={(event) => {
            event.preventDefault();
            send(false, { ...(reason ? { reason } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}) });
            setSent(true);
          }}
        >
          <fieldset>
            <legend className="mb-2 text-sm text-muted-foreground">What was wrong?</legend>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((option) => (
                <label key={option.value} className={["cursor-pointer rounded-full border px-3 py-1 text-xs", reason === option.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"].join(" ")}>
                  <input type="radio" name="kb-feedback-reason" value={option.value} className="sr-only" checked={reason === option.value} onChange={() => setReason(option.value)} />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Anything else? (optional)</span>
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Send
          </button>
        </form>
      ) : (
        (userFeedback || sent) && <p className="mt-2 text-xs text-muted-foreground">Thanks for your feedback!</p>
      )}
    </div>
  );
}
