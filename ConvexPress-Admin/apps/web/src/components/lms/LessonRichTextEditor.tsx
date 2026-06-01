import { type ReactNode, useMemo, useRef, useState } from "react";
import {
  Bold,
  Code2,
  Eye,
  Heading2,
  ImagePlus,
  Italic,
  LinkIcon,
  List,
  ListOrdered,
  MessageSquareQuote,
  MonitorPlay,
  Pencil,
  Quote,
  SeparatorHorizontal,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { useQuery } from "convex-helpers/react/cache";
import { cn } from "@/lib/utils";
import { MediaSelector } from "./MediaSelector";

type Mode = "write" | "preview";
type InsertPanel = "media" | "embed" | null;

interface LessonRichTextEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  description?: string;
  disabled?: boolean;
}

export function LessonRichTextEditor({
  label,
  value,
  onChange,
  placeholder,
  minRows = 14,
  description,
  disabled = false,
}: LessonRichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mode, setMode] = useState<Mode>("write");
  const [insertPanel, setInsertPanel] = useState<InsertPanel>(null);
  const [mediaImageId, setMediaImageId] = useState<Id<"media"> | null>(null);
  const [mediaAlt, setMediaAlt] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [externalImageUrl, setExternalImageUrl] = useState("");
  const [embedUrl, setEmbedUrl] = useState("");
  const [embedTitle, setEmbedTitle] = useState("");
  const id = editorId(label);
  const stats = useMemo(() => getStats(value), [value]);

  function replaceSelection(nextValue: string, nextStart: number, nextEnd = nextStart) {
    if (disabled) return;
    onChange(nextValue);
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(nextStart, nextEnd);
    });
  }

  function insertText(text: string, selectOffset = text.length) {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(value ? `${value}\n\n${text}` : text);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
    replaceSelection(next, start + selectOffset);
  }

  function insertBlock(markup: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      const prefix = value.trim() ? "\n\n" : "";
      onChange(`${value}${prefix}${markup}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const prefix = before.trim() && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const suffix = after.trim() && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
    const next = `${before}${prefix}${markup}${suffix}${after}`;
    replaceSelection(next, before.length + prefix.length + markup.length);
  }

  function wrapSelection(before: string, after = before, fallback = "text") {
    const textarea = textareaRef.current;
    if (!textarea) return insertText(`${before}${fallback}${after}`, before.length);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    const replacement = `${before}${selected}${after}`;
    const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
    const selectStart = start + before.length;
    replaceSelection(next, selectStart, selectStart + selected.length);
  }

  function prefixLines(prefix: string, numbered = false) {
    const textarea = textareaRef.current;
    if (!textarea) return insertText(`${prefix}New block`);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || "New block";
    const lines = selected.split("\n");
    const replacement = lines
      .map((line, index) => {
        if (!line.trim()) return line;
        return `${numbered ? `${index + 1}. ` : prefix}${line.replace(/^([#>\-\d. ]+)?/, "")}`;
      })
      .join("\n");
    const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
    replaceSelection(next, start, start + replacement.length);
  }

  function handleShortcut(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (disabled) return;
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      wrapSelection("**", "**", "bold text");
    }
    if (key === "i") {
      event.preventDefault();
      wrapSelection("_", "_", "italic text");
    }
    if (key === "k") {
      event.preventDefault();
      wrapSelection("[", "](https://example.com)", "link text");
    }
  }

  function insertSelectedMediaImage() {
    if (!mediaImageId) return;
    insertBlock(buildImageMarkup(`media:${mediaImageId}`, mediaAlt || "Image", mediaCaption));
    setInsertPanel(null);
  }

  function insertExternalImage() {
    const src = normalizePreviewUrl(externalImageUrl, true);
    if (!src) return;
    insertBlock(buildImageMarkup(src, mediaAlt || "Image", mediaCaption));
    setExternalImageUrl("");
    setInsertPanel(null);
  }

  function insertEmbed() {
    const src = normalizePreviewUrl(embedUrl, false);
    if (!src) return;
    insertBlock(buildEmbedMarkup(src, embedTitle));
    setEmbedUrl("");
    setEmbedTitle("");
    setInsertPanel(null);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label id={`${id}-label`} htmlFor={id} className="text-sm font-semibold">
            {label}
          </label>
          {description ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div
          className="inline-flex border border-border bg-background p-1"
          role="tablist"
          aria-label="Editor mode"
        >
          <ModeButton active={mode === "write"} onClick={() => setMode("write")}>
            <Pencil className="size-3.5" aria-hidden="true" />
            Write
          </ModeButton>
          <ModeButton active={mode === "preview"} onClick={() => setMode("preview")}>
            <Eye className="size-3.5" aria-hidden="true" />
            Preview
          </ModeButton>
        </div>
      </div>

      {mode === "write" ? (
        <>
          <div className="flex flex-wrap items-center gap-1 border border-border bg-background p-1">
            <ToolbarButton title="Heading" disabled={disabled} onClick={() => prefixLines("## ")}>
              <Heading2 className="size-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton title="Bold" disabled={disabled} onClick={() => wrapSelection("**", "**", "bold text")}>
              <Bold className="size-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton title="Italic" disabled={disabled} onClick={() => wrapSelection("_", "_", "italic text")}>
              <Italic className="size-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton title="Link" disabled={disabled} onClick={() => wrapSelection("[", "](https://example.com)", "link text")}>
              <LinkIcon className="size-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton title="Image" disabled={disabled} onClick={() => setInsertPanel(insertPanel === "media" ? null : "media")}>
              <ImagePlus className="size-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton title="Embed" disabled={disabled} onClick={() => setInsertPanel(insertPanel === "embed" ? null : "embed")}>
              <MonitorPlay className="size-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton title="Quote" disabled={disabled} onClick={() => prefixLines("> ")}>
              <Quote className="size-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton title="Bulleted list" disabled={disabled} onClick={() => prefixLines("- ")}>
              <List className="size-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton title="Numbered list" disabled={disabled} onClick={() => prefixLines("1. ", true)}>
              <ListOrdered className="size-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton title="Inline code" disabled={disabled} onClick={() => wrapSelection("`", "`", "code")}>
              <Code2 className="size-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton title="Callout" disabled={disabled} onClick={() => insertText("> [!NOTE]\n> Important note", 12)}>
              <MessageSquareQuote className="size-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton title="Divider" disabled={disabled} onClick={() => insertText("\n\n---\n\n", 5)}>
              <SeparatorHorizontal className="size-4" aria-hidden="true" />
            </ToolbarButton>
          </div>
          {insertPanel === "media" ? (
            <MediaInsertPanel
              id={id}
              disabled={disabled}
              mediaImageId={mediaImageId}
              onMediaImageIdChange={setMediaImageId}
              alt={mediaAlt}
              onAltChange={setMediaAlt}
              caption={mediaCaption}
              onCaptionChange={setMediaCaption}
              externalImageUrl={externalImageUrl}
              onExternalImageUrlChange={setExternalImageUrl}
              onInsertMedia={insertSelectedMediaImage}
              onInsertExternal={insertExternalImage}
            />
          ) : null}
          {insertPanel === "embed" ? (
            <EmbedInsertPanel
              id={id}
              disabled={disabled}
              url={embedUrl}
              onUrlChange={setEmbedUrl}
              title={embedTitle}
              onTitleChange={setEmbedTitle}
              onInsert={insertEmbed}
            />
          ) : null}
          <textarea
            ref={textareaRef}
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleShortcut}
            disabled={disabled}
            placeholder={placeholder}
            rows={minRows}
            className="w-full resize-y rounded-none border border-border bg-background px-4 py-3 font-mono text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-70"
          />
        </>
      ) : (
        <LessonPreview value={value} emptyLabel={`${label} preview is empty.`} />
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-live="polite">
        <span>{stats.words} words</span>
        <span>{stats.blocks} blocks</span>
        <span>{stats.minutes} min read</span>
        <span>{stats.characters} characters</span>
      </div>
    </section>
  );
}

function MediaInsertPanel({
  id,
  disabled,
  mediaImageId,
  onMediaImageIdChange,
  alt,
  onAltChange,
  caption,
  onCaptionChange,
  externalImageUrl,
  onExternalImageUrlChange,
  onInsertMedia,
  onInsertExternal,
}: {
  id: string;
  disabled: boolean;
  mediaImageId: Id<"media"> | null;
  onMediaImageIdChange: (value: Id<"media"> | null) => void;
  alt: string;
  onAltChange: (value: string) => void;
  caption: string;
  onCaptionChange: (value: string) => void;
  externalImageUrl: string;
  onExternalImageUrlChange: (value: string) => void;
  onInsertMedia: () => void;
  onInsertExternal: () => void;
}) {
  const safeExternalImageUrl = normalizePreviewUrl(externalImageUrl, true);
  return (
    <div className="space-y-4 border border-border bg-muted/20 p-3">
      <MediaSelector
        value={mediaImageId}
        onChange={onMediaImageIdChange}
        mediaType="image"
        placeholder="Search images"
        disabled={disabled}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <InlineField label="Alt text" htmlFor={`${id}-image-alt`}>
          <input
            id={`${id}-image-alt`}
            value={alt}
            onChange={(event) => onAltChange(event.target.value)}
            disabled={disabled}
            className="h-9 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-70"
          />
        </InlineField>
        <InlineField label="Caption" htmlFor={`${id}-image-caption`}>
          <input
            id={`${id}-image-caption`}
            value={caption}
            onChange={(event) => onCaptionChange(event.target.value)}
            disabled={disabled}
            className="h-9 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-70"
          />
        </InlineField>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <InlineField label="Image URL" htmlFor={`${id}-image-url`}>
          <input
            id={`${id}-image-url`}
            value={externalImageUrl}
            onChange={(event) => onExternalImageUrlChange(event.target.value)}
            disabled={disabled}
            placeholder="https://example.com/image.jpg"
            className="h-9 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-70"
          />
        </InlineField>
        <button
          type="button"
          disabled={disabled || !mediaImageId}
          onClick={onInsertMedia}
          className="inline-flex h-9 items-center justify-center gap-1.5 self-end border border-border bg-background px-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ImagePlus className="size-4" aria-hidden="true" />
          Insert media
        </button>
        <button
          type="button"
          disabled={disabled || !safeExternalImageUrl}
          onClick={onInsertExternal}
          className="inline-flex h-9 items-center justify-center gap-1.5 self-end border border-border bg-background px-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LinkIcon className="size-4" aria-hidden="true" />
          Insert URL
        </button>
      </div>
    </div>
  );
}

function EmbedInsertPanel({
  id,
  disabled,
  url,
  onUrlChange,
  title,
  onTitleChange,
  onInsert,
}: {
  id: string;
  disabled: boolean;
  url: string;
  onUrlChange: (value: string) => void;
  title: string;
  onTitleChange: (value: string) => void;
  onInsert: () => void;
}) {
  const safeUrl = normalizePreviewUrl(url, false);
  return (
    <div className="grid gap-3 border border-border bg-muted/20 p-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_auto]">
      <InlineField label="Embed URL" htmlFor={`${id}-embed-url`}>
        <input
          id={`${id}-embed-url`}
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          disabled={disabled}
          placeholder="https://youtube.com/watch?v=..."
          className="h-9 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-70"
        />
      </InlineField>
      <InlineField label="Title" htmlFor={`${id}-embed-title`}>
        <input
          id={`${id}-embed-title`}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          disabled={disabled}
          className="h-9 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-70"
        />
      </InlineField>
      <button
        type="button"
        disabled={disabled || !safeUrl}
        onClick={onInsert}
        className="inline-flex h-9 items-center justify-center gap-1.5 self-end border border-border bg-background px-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MonitorPlay className="size-4" aria-hidden="true" />
        Insert embed
      </button>
    </div>
  );
}

function InlineField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="grid gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 px-3 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarButton({
  title,
  children,
  onClick,
  disabled,
}: {
  title: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-8 items-center justify-center rounded-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function LessonPreview({ value, emptyLabel }: { value: string; emptyLabel: string }) {
  const blocks = useMemo(() => parsePreview(value), [value]);
  if (blocks.length === 0) {
    return (
      <div className="min-h-52 border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="min-h-52 space-y-4 border border-border bg-background p-5 text-sm leading-7">
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

type PreviewBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "bulletList"; items: string[] }
  | { type: "orderedList"; items: string[] }
  | { type: "code"; text: string }
  | { type: "image"; alt: string; caption?: string; mediaId?: string; src?: string }
  | { type: "embed"; url: string; title?: string }
  | { type: "rule" };

function parsePreview(value: string): PreviewBlock[] {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const blocks: PreviewBlock[] = [];
  let paragraph: string[] = [];
  let list: { type: "bulletList" | "orderedList"; items: string[] } | null = null;
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push(list);
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (code) {
      if (line.trim() === "```") {
        blocks.push({ type: "code", text: code.join("\n") });
        code = null;
      } else {
        code.push(rawLine);
      }
      continue;
    }
    if (line.trim() === "```") {
      flushParagraph();
      flushList();
      code = [];
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const image = parsePreviewImage(line.trim());
    if (image) {
      flushParagraph();
      flushList();
      blocks.push(image);
      continue;
    }
    const embed = parsePreviewEmbed(line.trim());
    if (embed) {
      flushParagraph();
      flushList();
      blocks.push(embed);
      continue;
    }
    if (/^-{3,}$/.test(line.trim())) {
      flushParagraph();
      flushList();
      blocks.push({ type: "rule" });
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2],
      });
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)/);
    if (bullet) {
      flushParagraph();
      if (!list || list.type !== "bulletList") {
        flushList();
        list = { type: "bulletList", items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }
    const ordered = line.match(/^\s*\d+\.\s+(.+)/);
    if (ordered) {
      flushParagraph();
      if (!list || list.type !== "orderedList") {
        flushList();
        list = { type: "orderedList", items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }
    if (line.startsWith("> ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: line.slice(2) });
      continue;
    }
    paragraph.push(line.trim());
  }

  if (code) blocks.push({ type: "code", text: code.join("\n") });
  flushParagraph();
  flushList();
  return blocks;
}

function renderBlock(block: PreviewBlock, index: number) {
  if (block.type === "heading") {
    const className =
      block.level === 1
        ? "text-2xl font-semibold"
        : block.level === 2
          ? "text-xl font-semibold"
          : "text-lg font-semibold";
    const Heading = `h${block.level}` as "h1" | "h2" | "h3";
    return (
      <Heading key={index} className={className}>
        {renderInline(block.text)}
      </Heading>
    );
  }
  if (block.type === "quote") {
    return (
      <blockquote key={index} className="border-l-2 border-primary pl-4 text-muted-foreground">
        {renderInline(block.text)}
      </blockquote>
    );
  }
  if (block.type === "bulletList") {
    return (
      <ul key={index} className="list-disc space-y-1 pl-5">
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "orderedList") {
    return (
      <ol key={index} className="list-decimal space-y-1 pl-5">
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInline(item)}</li>
        ))}
      </ol>
    );
  }
  if (block.type === "code") {
    return (
      <pre key={index} className="overflow-x-auto border border-border bg-muted p-3 text-xs">
        <code>{block.text}</code>
      </pre>
    );
  }
  if (block.type === "rule") {
    return <hr key={index} className="border-border" />;
  }
  if (block.type === "image") {
    return <PreviewImage key={index} block={block} />;
  }
  if (block.type === "embed") {
    return (
      <a
        key={index}
        href={block.url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 border border-border bg-muted/40 p-3 text-sm font-medium text-primary hover:bg-muted"
      >
        <MonitorPlay className="size-5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{block.title || block.url}</span>
      </a>
    );
  }
  return <p key={index}>{renderInline(block.text)}</p>;
}

function PreviewImage({
  block,
}: {
  block: Extract<PreviewBlock, { type: "image" }>;
}) {
  const media = useQuery(
    api.media.queries.get,
    block.mediaId ? { mediaId: block.mediaId as Id<"media"> } : "skip",
  ) as { title?: string | null; altText?: string | null; url?: string | null } | null | undefined;
  const src = media?.url ?? block.src;
  const alt = block.alt || media?.altText || media?.title || "";

  return (
    <figure className="space-y-2">
      {block.mediaId && media === undefined ? (
        <div className="h-56 w-full animate-pulse bg-muted" aria-hidden="true" />
      ) : src ? (
        <img src={src} alt={alt} loading="lazy" className="max-h-96 w-full object-contain" />
      ) : (
        <div className="border border-dashed border-border p-6 text-sm text-muted-foreground">
          Selected media is not available.
        </div>
      )}
      {block.caption ? <figcaption className="text-xs text-muted-foreground">{block.caption}</figcaption> : null}
    </figure>
  );
}

function renderInline(text: string) {
  const nodes: ReactNode[] = [];
  const pattern = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = normalizeInlineLinkUrl(link[2]);
      nodes.push(
        href ? (
          <a
            key={`${match.index}-link`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline underline-offset-4"
          >
            {link[1]}
          </a>
        ) : (
          link[1]
        ),
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={`${match.index}-bold`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("_")) {
      nodes.push(<em key={`${match.index}-italic`}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={`${match.index}-code`} className="bg-muted px-1 py-0.5 text-xs">
          {token.slice(1, -1)}
        </code>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function getStats(value: string) {
  const normalized = value.trim();
  const words = normalized ? normalized.split(/\s+/).filter(Boolean).length : 0;
  const blocks = normalized
    ? normalized.split(/\n{2,}/).filter((block) => block.trim().length > 0).length
    : 0;
  return {
    words,
    blocks,
    characters: value.length,
    minutes: Math.max(1, Math.ceil(words / 220)),
  };
}

function parsePreviewImage(line: string): Extract<PreviewBlock, { type: "image" }> | null {
  const image = line.match(/^!\[([^\]]*)\]\((.+)\)$/);
  if (!image) return null;
  const parsed = parseMediaTarget(image[2]);
  if (!parsed) return null;
  return {
    type: "image",
    alt: cleanMarkupText(image[1]),
    caption: parsed.caption,
    ...parsed.target,
  };
}

function parsePreviewEmbed(line: string): Extract<PreviewBlock, { type: "embed" }> | null {
  const embed = line.match(/^\{\{embed:([^}|]+)(?:\|([^}]+))?\}\}$/);
  if (!embed) return null;
  const url = normalizePreviewUrl(embed[1], false);
  if (!url) return null;
  return {
    type: "embed",
    url,
    title: cleanMarkupText(embed[2] ?? ""),
  };
}

function parseMediaTarget(
  rawTarget: string,
): { target: { mediaId?: string; src?: string }; caption?: string } | null {
  const match = rawTarget.trim().match(/^(\S+?)(?:\s+"([^"]*)")?$/);
  if (!match) return null;
  const destination = match[1];
  const caption = cleanMarkupText(match[2] ?? "");
  if (destination.startsWith("media:")) {
    const mediaId = destination.slice("media:".length).trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(mediaId)) return null;
    return { target: { mediaId }, caption };
  }
  const src = normalizePreviewUrl(destination, true);
  return src ? { target: { src }, caption } : null;
}

function buildImageMarkup(target: string, alt: string, caption: string) {
  const safeAlt = cleanMarkupText(alt) || "Image";
  const safeCaption = cleanMarkupText(caption);
  return `![${safeAlt}](${target}${safeCaption ? ` "${safeCaption}"` : ""})`;
}

function buildEmbedMarkup(url: string, title: string) {
  const safeTitle = cleanMarkupText(title);
  return `{{embed:${url}${safeTitle ? `|${safeTitle}` : ""}}}`;
}

function normalizePreviewUrl(value: string, allowRelative: boolean): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (allowRelative && raw.startsWith("/")) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeInlineLinkUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith("/") || raw.startsWith("#")) return raw;
  try {
    const url = new URL(raw);
    if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return url.toString();
  } catch {
    return null;
  }
  return null;
}

function cleanMarkupText(value: string) {
  return value.replace(/[\n\r"\]{}|]+/g, " ").replace(/\s+/g, " ").trim();
}

function editorId(label: string) {
  return `lms-lesson-editor-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
