import type { ReactNode } from "react";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

import { MediaImage } from "@/components/media/MediaImage";
import { cn } from "@/lib/utils";

type TiptapMark = {
  type?: string;
  attrs?: Record<string, unknown>;
};

type TiptapNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: TiptapMark[];
  content?: TiptapNode[];
};

type LessonContentRendererProps = {
  doc?: unknown;
  fallbackText?: string | null;
  emptyLabel?: string;
  className?: string;
};

export function LessonContentRenderer({
  doc,
  fallbackText,
  emptyLabel = "No content yet.",
  className,
}: LessonContentRendererProps) {
  const root = normalizeDoc(doc);
  const children = root ? renderChildren(root.content ?? []) : [];

  if (children.length > 0) {
    return (
      <div className={cn("space-y-4 text-sm leading-7 text-foreground", className)}>
        {children}
      </div>
    );
  }

  const fallback = (fallbackText ?? "").trim();
  if (fallback) {
    return (
      <div className={cn("space-y-3 text-sm leading-7 text-foreground", className)}>
        {fallback.split(/\n{2,}/).map((paragraph, index) => (
          <p key={`${paragraph}-${index}`} className="whitespace-pre-wrap">
            {paragraph}
          </p>
        ))}
      </div>
    );
  }

  return <span className="text-sm text-muted-foreground">{emptyLabel}</span>;
}

function normalizeDoc(doc: unknown): TiptapNode | null {
  if (!isRecord(doc)) return null;
  if (doc.type !== "doc" || !Array.isArray(doc.content)) return null;
  const hasContent = doc.content.some((node) => !isEmptyBlock(node as TiptapNode));
  return hasContent ? (doc as TiptapNode) : null;
}

function isEmptyBlock(node: TiptapNode): boolean {
  if (!node || node.type === "horizontalRule" || node.type === "image") return false;
  if (node.type === "text") return !(node.text ?? "").trim();
  const content = Array.isArray(node.content) ? node.content : [];
  return content.every(isEmptyBlock);
}

function renderChildren(nodes: TiptapNode[]): ReactNode[] {
  return nodes
    .map((node, index) => renderNode(node, `${node.type ?? "node"}-${index}`))
    .filter(Boolean);
}

function renderNode(node: TiptapNode, key: string): ReactNode {
  const children = Array.isArray(node.content) ? renderChildren(node.content) : [];

  if (node.type === "text") {
    return renderTextNode(node, key);
  }
  if (node.type === "hardBreak") {
    return <br key={key} />;
  }
  if (node.type === "paragraph") {
    return (
      <p key={key} className="text-sm leading-7 text-muted-foreground">
        {children.length > 0 ? children : <br />}
      </p>
    );
  }
  if (node.type === "heading") {
    const level = clampHeadingLevel(node.attrs?.level);
    const classes = headingClass(level);
    if (level === 1) return <h1 key={key} className={classes}>{children}</h1>;
    if (level === 2) return <h2 key={key} className={classes}>{children}</h2>;
    if (level === 3) return <h3 key={key} className={classes}>{children}</h3>;
    if (level === 4) return <h4 key={key} className={classes}>{children}</h4>;
    if (level === 5) return <h5 key={key} className={classes}>{children}</h5>;
    return <h6 key={key} className={classes}>{children}</h6>;
  }
  if (node.type === "bulletList") {
    return (
      <ul key={key} className="list-disc space-y-1 pl-5 text-muted-foreground">
        {children}
      </ul>
    );
  }
  if (node.type === "orderedList") {
    const start = numberAttr(node.attrs?.start) ?? 1;
    return (
      <ol key={key} start={start} className="list-decimal space-y-1 pl-5 text-muted-foreground">
        {children}
      </ol>
    );
  }
  if (node.type === "listItem") {
    return (
      <li key={key} className="pl-1 leading-7">
        {children}
      </li>
    );
  }
  if (node.type === "blockquote") {
    return (
      <blockquote key={key} className="border-l-4 border-primary/40 pl-4 text-muted-foreground">
        {children}
      </blockquote>
    );
  }
  if (node.type === "codeBlock") {
    return (
      <pre key={key} className="overflow-x-auto border border-border bg-muted p-4 text-xs leading-6">
        <code>{collectText(node)}</code>
      </pre>
    );
  }
  if (node.type === "horizontalRule") {
    return <hr key={key} className="border-border" />;
  }
  if (node.type === "image") {
    return <LessonImage key={key} attrs={node.attrs} />;
  }
  if (node.type === "callout") {
    return (
      <aside key={key} className="border border-primary/30 bg-primary/5 p-4">
        {children}
      </aside>
    );
  }
  if (node.type === "taskList") {
    return (
      <ul key={key} className="space-y-2 pl-0 text-muted-foreground">
        {children}
      </ul>
    );
  }
  if (node.type === "taskItem") {
    const checked = node.attrs?.checked === true;
    return (
      <li key={key} className="flex gap-2 leading-7">
        <input type="checkbox" checked={checked} readOnly className="mt-1 size-4" />
        <span>{children}</span>
      </li>
    );
  }
  if (node.type === "table") {
    return (
      <div key={key} className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    );
  }
  if (node.type === "tableRow") {
    return <tr key={key}>{children}</tr>;
  }
  if (node.type === "tableHeader") {
    return <th key={key} className="border border-border bg-muted px-3 py-2 text-left">{children}</th>;
  }
  if (node.type === "tableCell") {
    return <td key={key} className="border border-border px-3 py-2 align-top">{children}</td>;
  }
  if (node.type === "embed") {
    return <LessonEmbed key={key} attrs={node.attrs} />;
  }

  return children.length > 0 ? <div key={key}>{children}</div> : null;
}

function renderTextNode(node: TiptapNode, key: string): ReactNode {
  let child: ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") {
      child = <strong key={`${key}-bold`}>{child}</strong>;
    } else if (mark.type === "italic") {
      child = <em key={`${key}-italic`}>{child}</em>;
    } else if (mark.type === "code") {
      child = (
        <code key={`${key}-code`} className="bg-muted px-1 py-0.5 text-[0.9em]">
          {child}
        </code>
      );
    } else if (mark.type === "link") {
      const href = safeUrl(stringAttr(mark.attrs?.href));
      if (href) {
        child = (
          <a key={`${key}-link`} href={href} target="_blank" rel="noreferrer" className="text-primary underline">
            {child}
          </a>
        );
      }
    }
  }
  return <span key={key}>{child}</span>;
}

function LessonImage({ attrs }: { attrs?: Record<string, unknown> }) {
  const mediaId = stringAttr(attrs?.mediaId);
  const alt = stringAttr(attrs?.alt) ?? "";
  const caption = stringAttr(attrs?.caption);
  const src = safeUrl(stringAttr(attrs?.src) ?? stringAttr(attrs?.url));

  if (mediaId) {
    return (
      <figure className="space-y-2">
        <MediaImage
          mediaId={mediaId as Id<"media">}
          alt={alt}
          preferredSize="large"
          sizes="(max-width: 768px) 100vw, 720px"
          className="max-h-[32rem] w-full object-contain"
        />
        {caption ? <figcaption className="text-xs text-muted-foreground">{caption}</figcaption> : null}
      </figure>
    );
  }
  if (!src) return null;
  return (
    <figure className="space-y-2">
      <img src={src} alt={alt} loading="lazy" className="max-h-[32rem] w-full object-contain" />
      {caption ? <figcaption className="text-xs text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  );
}

function LessonEmbed({ attrs }: { attrs?: Record<string, unknown> }) {
  const href = safeHttpUrl(stringAttr(attrs?.url) ?? stringAttr(attrs?.src));
  if (!href) return null;
  const title = stringAttr(attrs?.title) ?? "Embedded resource";
  const embedSrc = videoEmbedSrc(href);

  if (embedSrc) {
    return (
      <iframe
        title={title}
        src={embedSrc}
        className="aspect-video w-full border border-border"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-3 border border-border bg-muted/40 p-4 text-sm text-foreground hover:bg-muted"
    >
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{href}</span>
      </span>
      <span className="shrink-0 text-xs font-medium text-primary">Open</span>
    </a>
  );
}

function collectText(node: TiptapNode): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(collectText).join("");
}

function clampHeadingLevel(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(6, Math.max(1, Math.floor(parsed)));
}

function headingClass(level: number) {
  if (level === 1) return "text-3xl font-semibold leading-tight text-foreground";
  if (level === 2) return "text-2xl font-semibold leading-tight text-foreground";
  if (level === 3) return "text-xl font-semibold leading-snug text-foreground";
  return "text-base font-semibold leading-snug text-foreground";
}

function numberAttr(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringAttr(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeUrl(value?: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/") || value.startsWith("#")) return value;
  try {
    const url = new URL(value);
    if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) {
      return value;
    }
  } catch {
    return null;
  }
  return null;
}

function safeHttpUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol)) {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function videoEmbedSrc(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const videoId = url.pathname.startsWith("/shorts/")
        ? url.pathname.split("/")[2]
        : url.searchParams.get("v");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }
    if (host === "youtu.be") {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }
    if (host === "vimeo.com") {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
