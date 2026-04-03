import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import type React from "react";

export const Route = createFileRoute(
  "/_marketing/help/$categorySlug/$articleSlug",
)({
  component: ArticleReader,
  loader: async ({ context: { queryClient }, params }) => {
    await queryClient.ensureQueryData(
      convexQuery(api.kb.queries.getBySlug, { slug: params.articleSlug }),
    );
  },
  head: ({ params }) => ({
    meta: [
      {
        title: `${params.articleSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} - Help Center - ConvexPress`,
      },
    ],
  }),
});

// ─── Content Renderer ─────────────────────────────────────────────────────────

function ArticleContent({ content, plainText }: { content?: string; plainText?: string }) {
  // Try TipTap JSON first
  if (content) {
    try {
      const doc = JSON.parse(content);
      if (doc.type === "doc" && Array.isArray(doc.content)) {
        return <div className="max-w-none leading-relaxed text-foreground [&_p]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mb-2 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-4 [&_pre]:bg-muted [&_pre]:rounded [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:my-4 [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sm [&_hr]:border-border [&_hr]:my-6 [&_a]:text-primary [&_a]:underline">{renderTipTapNodes(doc.content)}</div>;
      }
    } catch {
      // Not JSON, fall through
    }
  }

  // Fallback to plain text
  if (plainText) {
    return (
      <div className="max-w-none whitespace-pre-wrap text-foreground leading-relaxed">
        {plainText}
      </div>
    );
  }

  return <p className="text-muted-foreground italic">This article has no content yet.</p>;
}

function renderTipTapNodes(nodes: any[]): React.ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "paragraph":
        return <p key={i}>{renderInlineContent(node.content)}</p>;
      case "heading": {
        const Tag = `h${node.attrs?.level ?? 2}` as keyof JSX.IntrinsicElements;
        return <Tag key={i}>{renderInlineContent(node.content)}</Tag>;
      }
      case "bulletList":
        return <ul key={i}>{renderTipTapNodes(node.content ?? [])}</ul>;
      case "orderedList":
        return <ol key={i}>{renderTipTapNodes(node.content ?? [])}</ol>;
      case "listItem":
        return <li key={i}>{renderTipTapNodes(node.content ?? [])}</li>;
      case "blockquote":
        return <blockquote key={i}>{renderTipTapNodes(node.content ?? [])}</blockquote>;
      case "codeBlock":
        return <pre key={i}><code>{renderInlineContent(node.content)}</code></pre>;
      case "horizontalRule":
        return <hr key={i} />;
      default:
        if (node.content) return <div key={i}>{renderTipTapNodes(node.content)}</div>;
        return null;
    }
  });
}

function sanitizeLinkHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const lower = href.trim().toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) return undefined;
  return href;
}

function isExternalLink(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://") || href.startsWith("//");
}

function renderInlineContent(content?: any[]): React.ReactNode {
  if (!content) return null;
  return content.map((node, i) => {
    if (node.type === "text") {
      let text: React.ReactNode = node.text;
      if (node.marks) {
        for (const [markIndex, mark] of node.marks.entries()) {
          const markKey = `${i}-${markIndex}`;
          if (mark.type === "bold") text = <strong key={markKey}>{text}</strong>;
          else if (mark.type === "italic") text = <em key={markKey}>{text}</em>;
          else if (mark.type === "code") text = <code key={markKey}>{text}</code>;
          else if (mark.type === "link") {
            const safeHref = sanitizeLinkHref(mark.attrs?.href);
            const external = safeHref ? isExternalLink(safeHref) : false;
            text = (
              <a
                key={markKey}
                href={safeHref}
                className="text-primary underline"
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {text}
              </a>
            );
          }
        }
      }
      return <span key={i}>{text}</span>;
    }
    return null;
  });
}

// ─── Article Reader ───────────────────────────────────────────────────────────

function ArticleReader() {
  const { categorySlug, articleSlug } = Route.useParams();

  const { data: article } = useSuspenseQuery(
    // @ts-expect-error - Convex query type mismatch with useSuspenseQuery
    convexQuery(api.kb.queries.getBySlug, { slug: articleSlug }),
  );

  // Session ID — initialized client-side only to avoid SSR hydration mismatches
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let id = sessionStorage.getItem("kb_session_id");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("kb_session_id", id);
    }
    setSessionId(id);
  }, []);

  const trackView = useMutation(api.kb.analytics.trackPageView);
  const submitFeedback = useMutation(api.kb.feedback.submitHelpful);

  const art = article as any;

  // Track page view on mount — only after sessionId is ready client-side
  useEffect(() => {
    if (!art?._id || !sessionId) return;
    void trackView({
      articleId: art._id,
      sessionId,
      referrer: typeof document !== "undefined" ? document.referrer : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    });
  }, [art?._id, sessionId]);

  // Get existing feedback to show which button is already selected
  const userFeedback = useQuery(
    api.kb.feedback.getUserFeedback,
    sessionId && art?._id ? { articleId: art._id, sessionId } : "skip",
  ) as any;

  async function handleFeedback(isHelpful: boolean) {
    if (!art?._id || !sessionId) return;
    await submitFeedback({
      articleId: art._id,
      sessionId,
      isHelpful,
    });
  }

  if (!article) {
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
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/help" className="hover:text-foreground transition-colors">
          Help Center
        </Link>
        <span className="mx-2">/</span>
        {art.category && (
          <>
            <Link
              to="/help/$categorySlug"
              params={{ categorySlug }}
              className="hover:text-foreground transition-colors"
            >
              {art.category.name}
            </Link>
            <span className="mx-2">/</span>
          </>
        )}
        <span className="text-foreground">{art.title}</span>
      </nav>

      {/* Article header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold leading-tight">{art.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {art.author && <span>By {art.author.displayName}</span>}
          {art.publishedAt && (
            <span>
              Updated {new Date(art.publishedAt).toLocaleDateString()}
            </span>
          )}
          {art.readingTimeMinutes && (
            <span>{art.readingTimeMinutes} min read</span>
          )}
        </div>
      </header>

      {/* Article content */}
      <article>
        <ArticleContent content={art.content} plainText={art.contentPlainText} />
      </article>

      {/* Helpful feedback widget */}
      <div className="mt-10 rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm font-medium">Was this article helpful?</p>
        <div className="mt-3 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => void handleFeedback(true)}
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
            onClick={() => void handleFeedback(false)}
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
      {art.relatedArticles && (art.relatedArticles as any[]).length > 0 && (
        <section className="mt-12 border-t border-border pt-8">
          <h2 className="mb-4 text-xl font-semibold">Related Articles</h2>
          <div className="space-y-3">
            {(art.relatedArticles as any[]).map((related) => (
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
