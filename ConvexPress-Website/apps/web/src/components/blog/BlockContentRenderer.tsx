import DOMPurify from "isomorphic-dompurify";
import { useMemo, type ElementType } from "react";
import type {
  BlockContent,
  BlockDocument,
  BlockMark,
  BlockquoteBlock,
  BulletListBlock,
  ButtonBlock,
  CalloutBlock,
  CodeBlock,
  ColumnBlock,
  ColumnsBlock,
  DividerBlock,
  EmbedBlock,
  GalleryBlock,
  HeadingBlock,
  HtmlBlock,
  ImageBlock,
  InlineContent,
  OrderedListBlock,
  ParagraphBlock,
  SpacerBlock,
  TableBlock,
  TaskListBlock,
} from "@/lib/blog/types";
import { cn } from "@/lib/utils";
import { MediaImage } from "../media/MediaImage";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

/** Map our align attr to Tailwind classes matching WP semantics. */
const ALIGN_CLASS: Record<NonNullable<ImageBlock["attrs"]["align"]>, string> = {
  none: "",
  left: "float-left mr-4 mb-2",
  right: "float-right ml-4 mb-2",
  center: "mx-auto",
  wide: "mx-[-2rem] md:mx-[-4rem]",
  full: "mx-[calc(50%-50vw)] w-screen",
};

interface BlockContentRendererProps {
  content: BlockDocument | null;
  className?: string;
}

/**
 * Renders TipTap/block editor JSON as React elements.
 * Each block type maps to a semantic HTML element.
 */
export function BlockContentRenderer({ content, className }: BlockContentRendererProps) {
  if (!content || !content.content || content.content.length === 0) {
    return null;
  }

  return (
    <div
      data-slot="block-content"
      className={cn("flex flex-col gap-4", className)}
    >
      {content.content.map((block, index) => (
        <RenderBlock key={`${block.type}-${index}`} block={block} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block Dispatcher
// ---------------------------------------------------------------------------

function RenderBlock({ block }: { block: BlockContent }) {
  switch (block.type) {
    case "heading":
      return <RenderHeading block={block} />;
    case "paragraph":
      return <RenderParagraph block={block} />;
    case "image":
      return <RenderImage block={block} />;
    case "gallery":
      return <RenderGallery block={block} />;
    case "blockquote":
      return <RenderBlockquote block={block} />;
    case "code":
      return <RenderCode block={block} />;
    case "orderedList":
      return <RenderOrderedList block={block} />;
    case "bulletList":
      return <RenderBulletList block={block} />;
    case "table":
      return <RenderTable block={block} />;
    case "embed":
      return <RenderEmbed block={block} />;
    case "horizontalRule":
      return <RenderHorizontalRule />;
    case "html":
      return <RenderHtml block={block} />;
    case "callout":
      return <RenderCallout block={block} />;
    case "button":
      return <RenderButton block={block} />;
    case "spacer":
      return <RenderSpacer block={block} />;
    case "divider":
      return <RenderDivider block={block} />;
    case "columns":
      return <RenderColumns block={block} />;
    case "taskList":
      return <RenderTaskList block={block} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Inline Content Renderer
// ---------------------------------------------------------------------------

function RenderInlineContent({ content }: { content?: InlineContent[] }) {
  if (!content) return null;

  return (
    <>
      {content.map((node, index) => {
        if (node.type !== "text") return null;

        let element: React.ReactNode = node.text;

        if (node.marks) {
          // Apply marks in order
          for (const mark of node.marks) {
            element = applyMark(element, mark, index);
          }
        }

        return <span key={`text-${index}-${node.text?.slice(0, 12) ?? ""}`}>{element}</span>;
      })}
    </>
  );
}

function applyMark(
  child: React.ReactNode,
  mark: BlockMark,
  key: number,
): React.ReactNode {
  switch (mark.type) {
    case "bold":
      return <strong key={`bold-${key}`}>{child}</strong>;
    case "italic":
      return <em key={`italic-${key}`}>{child}</em>;
    case "underline":
      return (
        <span key={`underline-${key}`} className="underline">
          {child}
        </span>
      );
    case "strike":
      return <s key={`strike-${key}`}>{child}</s>;
    case "code":
      return (
        <code
          key={`code-${key}`}
          className="rounded-none bg-muted px-1 py-0.5 text-xs font-mono"
        >
          {child}
        </code>
      );
    case "link":
      return (
        <a
          key={`link-${key}`}
          href={mark.attrs?.href}
          target={mark.attrs?.target}
          rel={mark.attrs?.rel ?? "noopener noreferrer"}
          className="text-primary underline underline-offset-2 transition-colors hover:text-primary/80"
        >
          {child}
        </a>
      );
    case "highlight":
      return (
        <mark
          key={`highlight-${key}`}
          className="bg-primary/20 text-foreground px-0.5"
          style={mark.attrs?.color ? { backgroundColor: mark.attrs.color } : undefined}
        >
          {child}
        </mark>
      );
    default:
      return child;
  }
}

// ---------------------------------------------------------------------------
// Block Type Renderers
// ---------------------------------------------------------------------------

function RenderHeading({ block }: { block: HeadingBlock }) {
  const Tag = `h${block.attrs.level}` as ElementType;

  const sizeClasses: Record<number, string> = {
    1: "text-xl font-bold leading-tight",
    2: "text-lg font-semibold leading-tight",
    3: "text-base font-semibold",
    4: "text-sm font-semibold",
    5: "text-sm font-medium",
    6: "text-xs font-medium uppercase tracking-wide",
  };

  return (
    <Tag className={sizeClasses[block.attrs.level] ?? "text-sm font-medium"}>
      <RenderInlineContent content={block.content} />
    </Tag>
  );
}

function RenderParagraph({ block }: { block: ParagraphBlock }) {
  // Empty paragraph = line break
  if (!block.content || block.content.length === 0) {
    return <br />;
  }

  return (
    <p className="text-xs leading-relaxed">
      <RenderInlineContent content={block.content} />
    </p>
  );
}

function RenderImage({ block }: { block: ImageBlock }) {
  const align = block.attrs.align ?? "none";
  const sizeSlug = block.attrs.sizeSlug ?? "large";
  const linkTo = block.attrs.linkTo ?? "none";

  // Build the image element — MediaImage when we have a mediaId, raw <img>
  // as legacy fallback.
  const inner = block.attrs.mediaId ? (
    <MediaImage
      mediaId={block.attrs.mediaId as Id<"media">}
      alt={block.attrs.alt ?? ""}
      className="w-full rounded-none"
      loading="lazy"
      preferredSize={sizeSlug === "full" ? undefined : sizeSlug}
      sizes="100vw"
      width={block.attrs.width}
      height={block.attrs.height}
    />
  ) : block.attrs.src ? (
    <img
      src={block.attrs.src}
      alt={block.attrs.alt ?? ""}
      title={block.attrs.title}
      width={block.attrs.width}
      height={block.attrs.height}
      className="w-full rounded-none"
      loading="lazy"
    />
  ) : null;

  // Apply WP-style link wrapping.
  let rendered: React.ReactNode = inner;
  if (linkTo === "custom" && block.attrs.linkUrl) {
    rendered = (
      <a href={block.attrs.linkUrl} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  } else if (linkTo === "media" && (block.attrs.src || block.attrs.mediaId)) {
    // "media" = link to the full-size asset. If we only have mediaId we
    // can't resolve a full URL on the server-rendered page; fall back to
    // wrapping with the provided src when present.
    if (block.attrs.src) {
      rendered = (
        <a href={block.attrs.src} target="_blank" rel="noopener noreferrer">
          {inner}
        </a>
      );
    }
  }

  return (
    <figure
      data-slot="block-image"
      data-align={align}
      className={cn("block-image", ALIGN_CLASS[align])}
    >
      {rendered}
      {block.attrs.caption && (
        <figcaption className="mt-2 text-center text-xs text-muted-foreground">
          {block.attrs.caption}
        </figcaption>
      )}
    </figure>
  );
}

function RenderGallery({ block }: { block: GalleryBlock }) {
  const columns = block.attrs.columns ?? 3;

  return (
    <div
      data-slot="block-gallery"
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${Math.min(columns, 4)}, minmax(0, 1fr))`,
      }}
    >
      {block.content.map((image, index) => (
        <figure key={image.attrs.mediaId ?? image.attrs.src ?? index}>
          {image.attrs.mediaId ? (
            <MediaImage
              mediaId={image.attrs.mediaId as Id<"media">}
              alt={image.attrs.alt ?? ""}
              className="aspect-square w-full rounded-none object-cover"
              loading="lazy"
              preferredSize="medium"
              sizes={`${Math.round(100 / Math.min(columns, 4))}vw`}
            />
          ) : image.attrs.src ? (
            <img
              src={image.attrs.src}
              alt={image.attrs.alt ?? ""}
              className="aspect-square w-full rounded-none object-cover"
              loading="lazy"
            />
          ) : null}
        </figure>
      ))}
    </div>
  );
}

function RenderBlockquote({ block }: { block: BlockquoteBlock }) {
  return (
    <blockquote className="border-l-2 border-primary pl-4 italic">
      {block.content?.map((child, index) => (
        <RenderBlock key={`blockquote-${child.type}-${index}`} block={child as BlockContent} />
      ))}
    </blockquote>
  );
}

function RenderCode({ block }: { block: CodeBlock }) {
  const text = block.content?.map((c) => c.text).join("") ?? "";

  return (
    <pre
      data-slot="block-code"
      className="overflow-x-auto rounded-none border border-border bg-muted p-4 font-mono text-xs leading-relaxed"
    >
      {block.attrs?.language && (
        <div className="mb-2 text-xs text-muted-foreground">
          {block.attrs.language}
        </div>
      )}
      <code>{text}</code>
    </pre>
  );
}

function RenderOrderedList({ block }: { block: OrderedListBlock }) {
  return (
    <ol
      className="list-decimal space-y-1 pl-6 text-xs leading-relaxed"
      start={block.attrs?.start}
    >
      {block.content.map((item, index) => (
        <li key={`ol-item-${index}`}>
          {item.content?.map((paragraph, pIndex) => (
            <RenderInlineContent key={`p-${pIndex}`} content={paragraph.content} />
          ))}
        </li>
      ))}
    </ol>
  );
}

function RenderBulletList({ block }: { block: BulletListBlock }) {
  return (
    <ul className="list-disc space-y-1 pl-6 text-xs leading-relaxed">
      {block.content.map((item, index) => (
        <li key={`ul-item-${index}`}>
          {item.content?.map((paragraph, pIndex) => (
            <RenderInlineContent key={`p-${pIndex}`} content={paragraph.content} />
          ))}
        </li>
      ))}
    </ul>
  );
}

function RenderTable({ block }: { block: TableBlock }) {
  return (
    <div data-slot="block-table" className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <tbody>
          {block.content.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border">
              {row.content.map((cell, cellIndex) => {
                const isHeader = cell.type === "tableHeader";
                const Tag = isHeader ? "th" : "td";
                return (
                  <Tag
                    key={cellIndex}
                    colSpan={cell.attrs?.colspan}
                    rowSpan={cell.attrs?.rowspan}
                    className={cn(
                      "border border-border px-3 py-2 text-left",
                      isHeader && "bg-muted font-medium",
                    )}
                  >
                    {cell.content?.map((p, pIndex) => (
                      <RenderInlineContent key={pIndex} content={p.content} />
                    ))}
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RenderEmbed({ block }: { block: EmbedBlock }) {
  const { src, provider } = block.attrs;

  // YouTube embed
  if (provider === "youtube" || src.includes("youtube.com") || src.includes("youtu.be")) {
    const videoId = extractYouTubeId(src);
    if (videoId) {
      return (
        <div data-slot="block-embed" className="relative aspect-video w-full">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            className="absolute inset-0 h-full w-full rounded-none"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="YouTube video"
            loading="lazy"
          />
        </div>
      );
    }
  }

  // Vimeo embed
  if (provider === "vimeo" || src.includes("vimeo.com")) {
    const vimeoId = src.match(/vimeo\.com\/(\d+)/)?.[1];
    if (vimeoId) {
      return (
        <div data-slot="block-embed" className="relative aspect-video w-full">
          <iframe
            src={`https://player.vimeo.com/video/${vimeoId}`}
            className="absolute inset-0 h-full w-full rounded-none"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title="Vimeo video"
            loading="lazy"
          />
        </div>
      );
    }
  }

  // Generic embed / fallback
  return (
    <div data-slot="block-embed" className="relative aspect-video w-full">
      <iframe
        src={src}
        className="absolute inset-0 h-full w-full rounded-none"
        allowFullScreen
        title="Embedded content"
        loading="lazy"
      />
    </div>
  );
}

function RenderHorizontalRule() {
  return <hr className="border-t border-border" />;
}

function RenderHtml({ block }: { block: HtmlBlock }) {
  // Sanitize HTML content using DOMPurify for robust XSS protection
  const sanitizedContent = useMemo(
    () => DOMPurify.sanitize(block.attrs.content ?? "", {
      ALLOWED_TAGS: [
        "b", "i", "strong", "em", "a", "code", "pre", "br", "p", "ul", "ol", "li",
        "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "span", "div",
        "table", "thead", "tbody", "tr", "th", "td", "hr", "img", "figure", "figcaption"
      ],
      ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "title", "class", "id", "width", "height"]
    }),
    [block.attrs.content]
  );

  return (
    <div
      data-slot="block-html"
      className="text-xs leading-relaxed"
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
}

// ---------------------------------------------------------------------------
// Callout Block
// ---------------------------------------------------------------------------

const CALLOUT_STYLES: Record<string, { border: string; bg: string; icon: string }> = {
  info: {
    border: "border-primary/40",
    bg: "bg-primary/5",
    icon: "\u2139\uFE0F",    // info icon
  },
  warning: {
    border: "border-warning/40",
    bg: "bg-warning/5",
    icon: "\u26A0\uFE0F",    // warning icon
  },
  error: {
    border: "border-destructive/40",
    bg: "bg-destructive/5",
    icon: "\u274C",           // error icon
  },
  success: {
    border: "border-accent/40",
    bg: "bg-accent/5",
    icon: "\u2705",           // success icon
  },
};

function RenderCallout({ block }: { block: CalloutBlock }) {
  const calloutType = block.attrs?.type ?? "info";
  const style = CALLOUT_STYLES[calloutType] ?? CALLOUT_STYLES.info;

  return (
    <div
      data-slot="block-callout"
      data-callout-type={calloutType}
      className={cn(
        "flex gap-3 rounded-none border-l-4 px-4 py-3",
        style.border,
        style.bg,
      )}
    >
      <span className="shrink-0 text-sm leading-relaxed" aria-hidden="true">
        {style.icon}
      </span>
      <div className="flex flex-1 flex-col gap-2">
        {block.content?.map((child, index) => (
          <RenderBlock key={`blockquote-${child.type}-${index}`} block={child as BlockContent} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Button Block
// ---------------------------------------------------------------------------

const BUTTON_VARIANT_CLASSES: Record<string, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline:
    "border border-border bg-transparent text-foreground hover:bg-muted",
};

function RenderButton({ block }: { block: ButtonBlock }) {
  const text = block.attrs?.text || "Click Here";
  const rawUrl = block.attrs?.url || "#";
  // Block javascript: protocol to prevent XSS
  const url = rawUrl.trim().toLowerCase().startsWith("javascript:") ? "#" : rawUrl;
  const variant = block.attrs?.variant ?? "primary";
  const alignment = block.attrs?.alignment ?? "left";

  const alignClass =
    alignment === "center"
      ? "justify-center"
      : alignment === "right"
        ? "justify-end"
        : "justify-start";

  const variantClass =
    BUTTON_VARIANT_CLASSES[variant] ?? BUTTON_VARIANT_CLASSES.primary;

  return (
    <div data-slot="block-button" className={cn("flex", alignClass)}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-block rounded-none px-6 py-2.5 text-xs font-medium transition-colors",
          variantClass,
        )}
      >
        {text}
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spacer Block
// ---------------------------------------------------------------------------

function RenderSpacer({ block }: { block: SpacerBlock }) {
  // Clamp height to a sensible range (4px - 200px) to prevent abuse
  const rawHeight = block.attrs?.height ?? 40;
  const height = Math.max(4, Math.min(200, rawHeight));

  return (
    <div
      data-slot="block-spacer"
      style={{ height: `${height}px` }}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Divider Block
// ---------------------------------------------------------------------------

function RenderDivider({ block }: { block: DividerBlock }) {
  const borderStyle = block.attrs?.style ?? "solid";

  // Only allow safe border-style values
  const safeBorderStyle = ["solid", "dashed", "dotted", "double"].includes(
    borderStyle,
  )
    ? borderStyle
    : "solid";

  return (
    <hr
      data-slot="block-divider"
      className="border-t-2 border-border"
      style={{ borderStyle: safeBorderStyle, opacity: 0.3 }}
    />
  );
}

// ---------------------------------------------------------------------------
// Columns Block
// ---------------------------------------------------------------------------

function RenderColumns({ block }: { block: ColumnsBlock }) {
  const count = Math.max(1, Math.min(4, block.attrs?.count ?? 2));

  return (
    <div
      data-slot="block-columns"
      className="grid gap-4"
      style={{
        gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
      }}
    >
      {block.content?.map((column, index) => (
        <RenderColumn key={`column-${index}`} block={column} />
      ))}
    </div>
  );
}

function RenderColumn({ block }: { block: ColumnBlock }) {
  return (
    <div data-slot="block-column" className="min-w-0">
      {block.content?.map((child, index) => (
        <RenderBlock key={`column-block-${child.type}-${index}`} block={child} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task List Block
// ---------------------------------------------------------------------------

function RenderTaskList({ block }: { block: TaskListBlock }) {
  return (
    <ul
      data-slot="block-task-list"
      className="space-y-1 text-xs leading-relaxed"
      role="list"
    >
      {block.content?.map((item, index) => {
        const checked = item.attrs?.checked ?? false;

        return (
          <li key={`task-item-${index}`} className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={checked}
              readOnly
              disabled
              aria-label={checked ? "Completed task" : "Incomplete task"}
              className="mt-0.5 h-4 w-4 shrink-0 rounded-none border border-border accent-primary"
            />
            <span className={cn(checked && "line-through opacity-60")}>
              {item.content?.map((paragraph, pIndex) => (
                <RenderInlineContent key={`p-${pIndex}`} content={paragraph.content} />
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtube\.com\/embed\/([^?]+)/,
    /youtu\.be\/([^?]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

