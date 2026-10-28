/**
 * Journal · help.article — a knowledge base article read like a magazine
 * piece: breadcrumbs, display title and small-caps meta in the reading
 * measure, the body (TipTap JSON or plain text) set in Journal prose, the
 * "Was this helpful?" row as two pills under a rule, and related articles as
 * a rule-separated list.
 *
 * The TipTap renderer mirrors Core's (same node and mark coverage, same href
 * sanitising) with Journal type instead of Core's utility styling.
 */
import { Link } from "@tanstack/react-router";

import { KbArticleBody } from "@/components/help/KbArticleBody";
import { KbArticleOutline } from "@/components/help/KbArticleOutline";
import { cn } from "@/lib/utils";
import type { HelpArticleSurfaceData } from "@/templates/packs/core/surfaces/help.article";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, EmptyState, LinkButton, Prose, Rule, SmallCaps, formatDate } from "../parts";
import { MetaLine } from "../parts/extra-plugins";

/* ───────────────────────── content ───────────────────────── */

const PROSE_CLASSES = [
  "text-base leading-8 text-foreground md:text-[17px]",
  "[&_p]:mb-6 [&_p:last-child]:mb-0",
  "[&_h1]:font-display [&_h1]:text-3xl [&_h1]:tracking-tight [&_h1]:mt-12 [&_h1]:mb-5 [&_h1]:leading-[1.08]",
  "[&_h2]:font-display [&_h2]:text-3xl [&_h2]:tracking-tight [&_h2]:mt-12 [&_h2]:mb-5 [&_h2]:leading-[1.08]",
  "[&_h3]:font-display [&_h3]:text-xl [&_h3]:tracking-tight [&_h3]:mt-10 [&_h3]:mb-4 [&_h3]:leading-snug",
  "[&_h4]:font-semibold [&_h4]:mt-8 [&_h4]:mb-3 [&_h5]:font-semibold [&_h5]:mt-6 [&_h5]:mb-2 [&_h6]:font-semibold [&_h6]:mt-6 [&_h6]:mb-2",
  "[&_ul]:mb-6 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-2 [&_li]:pl-1",
  "[&_blockquote]:my-8 [&_blockquote]:border-l [&_blockquote]:border-border [&_blockquote]:pl-6 [&_blockquote]:font-display [&_blockquote]:text-2xl [&_blockquote]:leading-snug [&_blockquote]:text-foreground",
  "[&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-sm [&_pre]:leading-6",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_hr]:my-10 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-border",
  "[&_a]:text-foreground [&_a]:underline [&_a]:decoration-border [&_a]:underline-offset-4 [&_a:hover]:decoration-foreground",
  "[&_img]:my-8 [&_img]:w-full [&_img]:rounded-2xl",
  "[&_table]:my-8 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-[0.18em] [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
  "[&_mark]:bg-primary/15 [&_mark]:text-foreground",
  "[&_details]:my-6 [&_details]:border-y [&_details]:border-border [&_details]:py-4 [&_summary]:cursor-pointer [&_summary]:font-medium [&_summary]:text-foreground",
].join(" ");

export default function JournalHelpArticle({ data }: SurfaceProps<HelpArticleSurfaceData>) {
  const { categorySlug, article, userFeedback, actions } = data;

  if (!article) {
    return (
      <Container data-slot="help-article" className="py-6 md:py-10">
        <div className="mx-auto w-full max-w-3xl">
          <EmptyState
            eyebrow="Help centre"
            title="Article not found."
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

  const votedHelpful = userFeedback?.isHelpful === true;
  const votedNotHelpful = userFeedback?.isHelpful === false;
  const updated = formatDate(article.updatedAt ?? article.publishedAt);

  return (
    <Container as="article" data-slot="help-article" className="flex flex-col gap-12 py-6 md:gap-16 md:py-10">
      <Prose>
        <Breadcrumbs
          items={[
            { label: "Help centre", to: "/help" },
            ...(article.category ? [{ label: article.category.name, to: "/help/$categorySlug", params: { categorySlug } }] : []),
            { label: article.title },
          ]}
        />
      </Prose>

      <Prose as="header" className="flex flex-col gap-5">
        {article.category ? (
          <Link to="/help/$categorySlug" params={{ categorySlug }} className="self-start text-[11px] font-semibold uppercase tracking-[0.22em] text-primary hover:underline">
            {article.category.name}
          </Link>
        ) : null}
        <h1 className="font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-5xl">{article.title}</h1>
        {article.excerpt ? <p className="text-base leading-8 text-muted-foreground md:text-[17px]">{article.excerpt}</p> : null}
        <MetaLine parts={[article.author ? `By ${article.author.displayName}` : null, updated ? `Updated ${updated}` : null, article.readingTimeMinutes ? `${article.readingTimeMinutes} min read` : null]} />
      </Prose>

      <Prose>
        <KbArticleOutline outline={article.outline} className="mb-10 border-y border-border py-4" />
        <KbArticleBody html={article.html} className={cn("max-w-none", PROSE_CLASSES)} />
      </Prose>

      {article.tags && article.tags.length > 0 ? (
        <Prose>
          <ul className="flex flex-wrap items-center gap-2 border-t border-border pt-8" aria-label="Tags">
            {article.tags.map((tag) => (
              <li key={tag._id} className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                {tag.name}
              </li>
            ))}
          </ul>
        </Prose>
      ) : null}

      {/* Feedback */}
      <Prose className="flex flex-col gap-8">
        <Rule />
        <div data-slot="article-feedback" className="flex flex-col items-center gap-5 text-center">
          <p className="font-display text-2xl tracking-tight text-foreground">Was this article helpful?</p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => actions.sendFeedback(true)}
              aria-pressed={votedHelpful}
              className={cn(
                "inline-flex h-11 items-center justify-center rounded-full border px-6 text-sm font-medium transition-colors",
                votedHelpful ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:border-primary hover:text-primary",
              )}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => actions.sendFeedback(false)}
              aria-pressed={votedNotHelpful}
              className={cn(
                "inline-flex h-11 items-center justify-center rounded-full border px-6 text-sm font-medium transition-colors",
                votedNotHelpful ? "border-destructive bg-destructive/10 text-destructive" : "border-border text-foreground hover:border-destructive hover:text-destructive",
              )}
            >
              No
            </button>
          </div>
          {userFeedback ? (
            <SmallCaps as="p" aria-live="polite">
              Thanks for your feedback
            </SmallCaps>
          ) : null}
        </div>
      </Prose>

      {/* Related */}
      {article.relatedArticles && article.relatedArticles.length > 0 ? (
        <Prose as="section" data-slot="related-articles" className="flex flex-col gap-8">
          <Rule />
          <h2 className="font-display text-3xl tracking-tight text-foreground md:text-4xl">Related articles</h2>
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {article.relatedArticles.map((related) => (
              <li key={related._id}>
                <Link to="/help/$categorySlug/$articleSlug" params={{ categorySlug: related.categorySlug ?? categorySlug, articleSlug: related.slug }} className="block py-4 font-display text-xl leading-snug tracking-tight text-foreground transition-colors hover:text-primary">
                  {related.title}
                </Link>
              </li>
            ))}
          </ul>
        </Prose>
      ) : null}
    </Container>
  );
}
