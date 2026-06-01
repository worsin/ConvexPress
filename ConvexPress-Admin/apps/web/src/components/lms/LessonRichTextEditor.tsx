import { type ReactNode, useMemo, useRef, useState } from "react";
import {
  Bold,
  Code2,
  Eye,
  Heading2,
  Italic,
  LinkIcon,
  List,
  ListOrdered,
  MessageSquareQuote,
  Pencil,
  Quote,
  SeparatorHorizontal,
} from "lucide-react";

import { cn } from "@/lib/utils";

type Mode = "write" | "preview";

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
  return <p key={index}>{renderInline(block.text)}</p>;
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
      nodes.push(
        <a
          key={`${match.index}-link`}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline underline-offset-4"
        >
          {link[1]}
        </a>,
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

function editorId(label: string) {
  return `lms-lesson-editor-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
