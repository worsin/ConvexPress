/**
 * Depot · help.article — the article reader on the reading measure: breadcrumb,
 * small title with a meta row of labels, the TipTap body (same node and mark
 * coverage and link sanitising as Core), a feedback card, related articles as
 * a card row.
 */
import { Link } from "@tanstack/react-router";
import type React from "react";

import { cn } from "@/lib/utils";
import type { HelpArticleSurfaceData } from "@/templates/packs/core/surfaces/help.article";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Button, Card, Container, EmptyState, Label, LinkButton, Prose, SectionHeading } from "../parts";

/* ───────────────────────── content renderer ───────────────────────── */

const bodyClasses = cn(
  "max-w-none text-sm leading-6 text-foreground",
  "[&_p]:mb-3 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold",
  "[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-[13px]",
  "[&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px]",
  "[&_hr]:my-6 [&_hr]:border-border [&_a]:text-primary [&_a]:underline [&_img]:my-3 [&_img]:rounded-md [&_img]:border [&_img]:border-border",
);

function ArticleContent({ content, plainText }: { content?: string; plainText?: string }) {
  if (content) {
    try {
      const doc = JSON.parse(content);
      if (doc.type === "doc" && Array.isArray(doc.content)) {
        return <div className={bodyClasses}>{renderTipTapNodes(doc.content)}</div>;
      }
    } catch {
      // Not JSON, fall through
    }
  }

  if (plainText) {
    return <div className="max-w-none whitespace-pre-wrap text-sm leading-6 text-foreground">{plainText}</div>;
  }

  return <p className="text-[13px] italic text-muted-foreground">This article has no content yet.</p>;
}

function renderTipTapNodes(nodes: any[]): React.ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "paragraph":
        return <p key={i}>{renderInlineContent(node.content)}</p>;
      case "heading": {
        const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 2))) as 1 | 2 | 3 | 4 | 5 | 6;
        const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
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
        return (
          <pre key={i}>
            <code>{renderInlineContent(node.content)}</code>
          </pre>
        );
      case "horizontalRule":
        return <hr key={i} />;
      case "image": {
        const src = sanitizeLinkHref(node.attrs?.src);
        return src ? <img key={i} src={src} alt={node.attrs?.alt ?? ""} title={node.attrs?.title ?? undefined} /> : null;
      }
      case "table":
        return (
          <div key={i} className="my-3 overflow-x-auto rounded-md border border-border">
            <table className="w-full border-collapse text-[13px]">
              <tbody>{renderTipTapNodes(node.content ?? [])}</tbody>
            </table>
          </div>
        );
      case "tableRow":
        return (
          <tr key={i} className="border-t border-border first:border-t-0">
            {renderTipTapNodes(node.content ?? [])}
          </tr>
        );
      case "tableCell":
        return (
          <td key={i} className="border-l border-border px-3 py-2 align-top first:border-l-0">
            {renderTipTapNodes(node.content ?? [])}
          </td>
        );
      case "tableHeader":
        return (
          <th key={i} className="border-l border-border bg-muted/40 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:border-l-0">
            {renderTipTapNodes(node.content ?? [])}
          </th>
        );
      case "taskList":
        return (
          <ul key={i} className="list-none pl-0">
            {renderTipTapNodes(node.content ?? [])}
          </ul>
        );
      case "taskItem": {
        const checked = node.attrs?.checked ?? false;
        return (
          <li key={i} className="mb-1 flex items-start gap-2">
            <input type="checkbox" checked={checked} readOnly className="mt-1 rounded-md" />
            <span>{renderTipTapNodes(node.content ?? [])}</span>
          </li>
        );
      }
      case "hardBreak":
        return <br key={i} />;
      case "details":
        return (
          <details key={i} className="my-3 rounded-md border border-border p-3">
            {renderTipTapNodes(node.content ?? [])}
          </details>
        );
      case "detailsSummary":
        return (
          <summary key={i} className="cursor-pointer text-sm font-semibold">
            {renderInlineContent(node.content)}
          </summary>
        );
      case "detailsContent":
        return (
          <div key={i} className="pt-2">
            {renderTipTapNodes(node.content ?? [])}
          </div>
        );
      default:
        if (node.content) return <div key={i}>{renderTipTapNodes(node.content)}</div>;
        return null;
    }
  });
}

function sanitizeLinkHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (/^(javascript|data|vbscript|blob):/i.test(trimmed)) return undefined;
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
          else if (mark.type === "underline") text = <u key={markKey}>{text}</u>;
          else if (mark.type === "strike") text = <s key={markKey}>{text}</s>;
          else if (mark.type === "highlight") text = <mark key={markKey}>{text}</mark>;
          else if (mark.type === "superscript") text = <sup key={markKey}>{text}</sup>;
          else if (mark.type === "subscript") text = <sub key={markKey}>{text}</sub>;
          else if (mark.type === "link") {
            const safeHref = sanitizeLinkHref(mark.attrs?.href);
            const external = safeHref ? isExternalLink(safeHref) : false;
            text = (
              <a key={markKey} href={safeHref} className="text-primary underline" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
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

/* ───────────────────────── reader ───────────────────────── */

export default function DepotHelpArticle({ data }: SurfaceProps<HelpArticleSurfaceData>) {
  const { categorySlug, article, userFeedback, actions } = data;

  if (!article) {
    return (
      <Container padded={false} data-slot="help-article" data-pack="depot" className="py-6 md:py-8">
        <EmptyState title="Article not found" description="This article does not exist or is not published." action={<LinkButton to="/help" variant="secondary">Back to Help Center</LinkButton>} />
      </Container>
    );
  }

  const votedHelpful = userFeedback?.isHelpful === true;
  const votedNotHelpful = userFeedback?.isHelpful === false;

  return (
    <Container padded={false} data-slot="help-article" data-pack="depot" className="flex flex-col gap-6 py-6 md:py-8">
      <Prose as="article" className="flex flex-col gap-5">
        <Breadcrumbs items={[{ label: "Help Center", to: "/help" }, ...(article.category ? [{ label: article.category.name, to: "/help/$categorySlug", params: { categorySlug } }] : []), { label: article.title }]} />

        <header className="flex flex-col gap-2 border-b border-border pb-4">
          {article.category ? <Label className="text-primary">{article.category.name}</Label> : null}
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{article.title}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {article.author ? <Label className="text-foreground">By {article.author.displayName}</Label> : null}
            {article.publishedAt ? <Label>Updated {new Date(article.publishedAt).toLocaleDateString()}</Label> : null}
            {article.readingTimeMinutes ? <Label>{article.readingTimeMinutes} min read</Label> : null}
          </div>
        </header>

        <ArticleContent content={article.content} plainText={article.contentPlainText} />

        {article.tags && article.tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Label>Tags</Label>
            {article.tags.map((tag) => (
              <span key={tag._id} className="inline-flex h-6 items-center rounded-md border border-border bg-background px-2 text-[11px] text-muted-foreground">
                {tag.name}
              </span>
            ))}
          </div>
        ) : null}

        <Card className="flex flex-col gap-3 p-4" role="group" aria-label="Article feedback">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">Was this article helpful?</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={votedHelpful ? "primary" : "secondary"} aria-pressed={votedHelpful} onClick={() => actions.sendFeedback(true)}>
                Yes
              </Button>
              <Button type="button" size="sm" variant="secondary" aria-pressed={votedNotHelpful} onClick={() => actions.sendFeedback(false)} className={cn(votedNotHelpful && "border-destructive bg-destructive/10 text-destructive")}>
                No
              </Button>
            </div>
          </div>
          {userFeedback ? <p className="text-xs text-muted-foreground">Thanks for your feedback!</p> : null}
        </Card>
      </Prose>

      {article.relatedArticles && article.relatedArticles.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading title="Related articles" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {article.relatedArticles.map((related) => (
              <Card key={related._id} className="transition-colors hover:border-primary/60">
                <Link to="/help/$categorySlug/$articleSlug" params={{ categorySlug: related.categorySlug ?? categorySlug, articleSlug: related.slug }} className="block p-3 text-sm font-semibold leading-5 text-foreground hover:text-primary">
                  {related.title}
                </Link>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </Container>
  );
}
