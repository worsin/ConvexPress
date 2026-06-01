/**
 * Lesson content helpers — lightweight authoring text <-> Tiptap JSON bridge.
 *
 * The admin editor stores a stable, markdown-like source string so authors can
 * work without a fresh editor dependency. These helpers persist it as structured
 * TipTap-compatible JSON so the LMS stays aligned with the wider content model,
 * including LMS-safe image and embed blocks.
 */

type TiptapTextNode = {
  type: "text";
  text: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[] | TiptapTextNode[];
};

const MAX_LESSON_TEXT_LENGTH = 100_000;

export function textToDoc(text: string): unknown {
  const blocks = parseBlocks(normalizeLessonText(text));
  return {
    type: "doc",
    content: blocks.length > 0 ? blocks : [{ type: "paragraph", content: [] }],
  };
}

export function docToText(doc: unknown): string {
  const d = doc as { content?: TiptapNode[] };
  if (!d || !Array.isArray(d.content)) return "";
  return d.content.map(nodeToText).filter(Boolean).join("\n\n");
}

export function normalizeLessonText(text: string): string {
  return (text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, MAX_LESSON_TEXT_LENGTH);
}

export function normalizeLessonTitle(title: string): string {
  const value = title.trim().replace(/\s+/g, " ");
  if (!value) return "Untitled lesson";
  return value.slice(0, 180);
}

export function normalizeOptionalUrl(value?: string): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function normalizeNonNegativeInt(value?: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

export function docsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function parseBlocks(text: string): TiptapNode[] {
  const lines = text.split("\n");
  const blocks: TiptapNode[] = [];
  let paragraph: string[] = [];
  let list: { type: "bulletList" | "orderedList"; items: string[] } | null = null;
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(paragraphNode(paragraph.join(" ")));
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({
      type: list.type,
      ...(list.type === "orderedList" ? { attrs: { start: 1 } } : {}),
      content: list.items.map((item) => ({
        type: "listItem",
        content: [paragraphNode(item)],
      })),
    });
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (code) {
      if (line.trim() === "```") {
        blocks.push({
          type: "codeBlock",
          content: code.length ? [{ type: "text", text: code.join("\n") }] : [],
        });
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
    const image = parseImageLine(line.trim());
    if (image) {
      flushParagraph();
      flushList();
      blocks.push(image);
      continue;
    }
    const embed = parseEmbedLine(line.trim());
    if (embed) {
      flushParagraph();
      flushList();
      blocks.push(embed);
      continue;
    }
    if (/^-{3,}$/.test(line.trim())) {
      flushParagraph();
      flushList();
      blocks.push({ type: "horizontalRule" });
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        attrs: { level: heading[1].length },
        content: inlineNodes(heading[2]),
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
      blocks.push({
        type: "blockquote",
        content: [paragraphNode(line.slice(2))],
      });
      continue;
    }
    paragraph.push(line.trim());
  }

  if (code) {
    blocks.push({
      type: "codeBlock",
      content: code.length ? [{ type: "text", text: code.join("\n") }] : [],
    });
  }
  flushParagraph();
  flushList();
  return blocks;
}

function paragraphNode(text: string): TiptapNode {
  return {
    type: "paragraph",
    content: inlineNodes(text),
  };
}

function inlineNodes(text: string): TiptapTextNode[] {
  const nodes: TiptapTextNode[] = [];
  const pattern = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    if (match.index > lastIndex) {
      nodes.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    const token = match[0];
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = normalizeInlineLinkUrl(link[2]);
      nodes.push(
        href
          ? {
              type: "text",
              text: link[1],
              marks: [{ type: "link", attrs: { href, target: "_blank" } }],
            }
          : { type: "text", text: link[1] },
      );
    } else if (token.startsWith("**")) {
      nodes.push({ type: "text", text: token.slice(2, -2), marks: [{ type: "bold" }] });
    } else if (token.startsWith("_")) {
      nodes.push({ type: "text", text: token.slice(1, -1), marks: [{ type: "italic" }] });
    } else if (token.startsWith("`")) {
      nodes.push({ type: "text", text: token.slice(1, -1), marks: [{ type: "code" }] });
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    nodes.push({ type: "text", text: text.slice(lastIndex) });
  }
  return nodes;
}

function nodeToText(node: TiptapNode | TiptapTextNode): string {
  if (node.type === "text") return textNodeToText(node as TiptapTextNode);
  const content = Array.isArray((node as TiptapNode).content)
    ? ((node as TiptapNode).content as Array<TiptapNode | TiptapTextNode>)
    : [];
  const inline = () => content.map(nodeToText).join("");

  if (node.type === "paragraph") return inline();
  if (node.type === "heading") {
    const level = Math.min(3, Math.max(1, Number((node as TiptapNode).attrs?.level ?? 2)));
    return `${"#".repeat(level)} ${inline()}`;
  }
  if (node.type === "blockquote") {
    return content
      .map(nodeToText)
      .join("\n")
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }
  if (node.type === "bulletList") {
    return content.map((item) => `- ${nodeToText(item as TiptapNode)}`).join("\n");
  }
  if (node.type === "orderedList") {
    return content
      .map((item, index) => `${index + 1}. ${nodeToText(item as TiptapNode)}`)
      .join("\n");
  }
  if (node.type === "listItem") {
    return content.map(nodeToText).join(" ");
  }
  if (node.type === "codeBlock") {
    return `\`\`\`\n${inline()}\n\`\`\``;
  }
  if (node.type === "horizontalRule") return "---";
  if (node.type === "image") return imageNodeToText(node as TiptapNode);
  if (node.type === "embed") return embedNodeToText(node as TiptapNode);
  return content.map(nodeToText).join("\n\n");
}

function textNodeToText(node: TiptapTextNode): string {
  let text = node.text ?? "";
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") text = `**${text}**`;
    if (mark.type === "italic") text = `_${text}_`;
    if (mark.type === "code") text = `\`${text}\``;
    if (mark.type === "link") {
      const href = normalizeInlineLinkUrl(String(mark.attrs?.href ?? ""));
      if (href) text = `[${text}](${href})`;
    }
  }
  return text;
}

function parseImageLine(line: string): TiptapNode | null {
  const image = line.match(/^!\[([^\]]*)\]\((.+)\)$/);
  if (!image) return null;
  const parsed = parseMediaTarget(image[2]);
  if (!parsed) return null;
  return {
    type: "image",
    attrs: {
      ...parsed.attrs,
      alt: cleanInlineAttr(image[1]),
      ...(parsed.caption ? { caption: parsed.caption } : {}),
    },
  };
}

function parseEmbedLine(line: string): TiptapNode | null {
  const embed = line.match(/^\{\{embed:([^}|]+)(?:\|([^}]+))?\}\}$/);
  if (!embed) return null;
  const url = normalizeHttpUrl(embed[1]);
  if (!url) return null;
  const title = cleanInlineAttr(embed[2] ?? "");
  return {
    type: "embed",
    attrs: {
      url,
      src: url,
      provider: detectVideoProvider(url),
      ...(title ? { title } : {}),
    },
  };
}

function parseMediaTarget(rawTarget: string): { attrs: Record<string, unknown>; caption?: string } | null {
  const target = rawTarget.trim();
  const match = target.match(/^(\S+?)(?:\s+"([^"]*)")?$/);
  if (!match) return null;
  const destination = match[1];
  const caption = cleanInlineAttr(match[2] ?? "");
  if (destination.startsWith("media:")) {
    const mediaId = destination.slice("media:".length).trim();
    if (!mediaId || !/^[a-zA-Z0-9_-]+$/.test(mediaId)) return null;
    return {
      attrs: { mediaId },
      caption,
    };
  }
  const src = normalizeImageUrl(destination);
  if (!src) return null;
  return {
    attrs: { src },
    caption,
  };
}

function imageNodeToText(node: TiptapNode): string {
  const attrs = node.attrs ?? {};
  const mediaId = cleanInlineAttr(String(attrs.mediaId ?? ""));
  const src = normalizeImageUrl(String(attrs.src ?? attrs.url ?? ""));
  const target = mediaId ? `media:${mediaId}` : src;
  if (!target) return "";
  const alt = cleanInlineAttr(String(attrs.alt ?? "Image")) || "Image";
  const caption = cleanInlineAttr(String(attrs.caption ?? ""));
  return `![${alt}](${target}${caption ? ` "${caption}"` : ""})`;
}

function embedNodeToText(node: TiptapNode): string {
  const attrs = node.attrs ?? {};
  const url = normalizeHttpUrl(String(attrs.url ?? attrs.src ?? ""));
  if (!url) return "";
  const title = cleanInlineAttr(String(attrs.title ?? ""));
  return `{{embed:${url}${title ? `|${title}` : ""}}}`;
}

function normalizeImageUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  return normalizeHttpUrl(raw);
}

function normalizeHttpUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
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
    if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function cleanInlineAttr(value: string): string {
  return value.replace(/[\n\r"\]{}|]+/g, " ").replace(/\s+/g, " ").trim();
}

export function detectVideoProvider(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "other";
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
    return "youtube";
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") return "vimeo";
  if (host === "wistia.com" || host.endsWith(".wistia.com")) return "wistia";
  if (
    host === "bunnycdn.com" ||
    host.endsWith(".bunnycdn.com") ||
    host === "b-cdn.net" ||
    host.endsWith(".b-cdn.net") ||
    host === "mediadelivery.net" ||
    host.endsWith(".mediadelivery.net")
  ) {
    return "bunny";
  }
  return "other";
}
