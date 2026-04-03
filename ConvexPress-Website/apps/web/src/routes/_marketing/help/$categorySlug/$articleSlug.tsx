import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
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
      { title: `${params.articleSlug} - Help Center - ConvexPress` },
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
        return <div className="prose max-w-none">{renderTipTapNodes(doc.content)}</div>;
      }
    } catch {
      // Not JSON, fall through
    }
  }

  // Fallback to plain text
  if (plainText) {
    return (
      <div className="prose max-w-none whitespace-pre-wrap text-foreground">
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

function renderInlineContent(content?: any[]): React.ReactNode {
  if (!content) return null;
  return content.map((node, i) => {
    if (node.type === "text") {
      let text: React.ReactNode = node.text;
      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type === "bold") text = <strong key={i}>{text}</strong>;
          if (mark.type === "italic") text = <em key={i}>{text}</em>;
          if (mark.type === "code") text = <code key={i}>{text}</code>;
          if (mark.type === "link") text = <a key={i} href={mark.attrs?.href} className="text-primary underline">{text}</a>;
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

  // Stable session ID for this browser session
  const sessionIdRef = useRef<string>(
    typeof sessionStorage !== "undefined"
      ? (sessionStorage.getItem("kb_session_id") ??
         (() => {
           const id = crypto.randomUUID();
           sessionStorage.setItem("kb_session_id", id);
           return id;
         })())
      : crypto.randomUUID(),
  );

  const trackView = useMutation(api.kb.analytics.trackPageView);
  const submitFeedback = useMutation(api.kb.feedback.submitHelpful);

  const art = article as any;

  // Track page view on mount
  useEffect(() => {
    if (!art?._id) return;
    void trackView({
      articleId: art._id,
      sessionId: sessionIdRef.current,
      referrer: typeof document !== "undefined" ? document.referrer : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    });
  }, [art?._id]);

  // Get existing feedback to show which button is already selected
  const userFeedback = useQuery(
    art?._id ? api.kb.feedback.getUserFeedback : ("skip" as any),
    art?._id
      ? { articleId: art._id, sessionId: sessionIdRef.current }
      : ("skip" as any),
  ) as any;

  async function handleFeedback(isHelpful: boolean) {
    if (!art?._id) return;
    await submitFeedback({
      articleId: art._id,
      sessionId: sessionIdRef.current,
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
                params={{ categorySlug, articleSlug: related.slug }}
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
