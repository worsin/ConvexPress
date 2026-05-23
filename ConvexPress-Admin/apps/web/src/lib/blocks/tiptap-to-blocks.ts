/**
 * TipTap (ProseMirror) JSON → ConvexPress blocks converter.
 *
 * Used during Phase 3 of the editor refactor to migrate posts that were
 * previously stored as TipTap article-mode content. Runs lazily when a post
 * is opened in the editor: if `contentMode === "article"` and `blocks` is
 * empty, we convert the document once and save back as blocks.
 *
 * Mapping rules:
 *   - paragraph              → core/paragraph (with inline marks → markdown)
 *   - heading (level 1-6)    → core/heading
 *   - bulletList / orderedList / taskList → core/list
 *   - blockquote             → core/quote (concatenates inner paragraphs)
 *   - codeBlock              → core/code (language attr if present)
 *   - horizontalRule         → core/divider
 *   - image                  → core/image (src → href, ALT preserved)
 *   - embed (custom)         → core/embed
 *   - callout (custom)       → core/paragraph for now (no callout block yet)
 *   - button (custom)        → core/paragraph with a link (best-effort)
 *   - spacer (custom)        → core/spacer
 *   - divider (custom)       → core/divider
 *   - columns/column (custom) → flattened to inner content (no admin columns yet)
 *   - reusableBlock          → core/paragraph (placeholder)
 *   - unknown node types     → core/paragraph with the recovered plain text
 *
 * The converter is intentionally tolerant — we'd rather produce something
 * lossy than throw and lose the user's content.
 */

import type { ConvexPressBlock } from "./types";

interface TipTapNode {
  type?: string;
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
}

function makeBlockId() {
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Convert a sequence of inline nodes to a markdown-ish string. */
function inlineToMarkdown(nodes: TipTapNode[] | undefined): string {
  if (!Array.isArray(nodes)) return "";
  return nodes
    .map((node) => {
      if (node.type === "text" && typeof node.text === "string") {
        let out = node.text;
        const marks = node.marks ?? [];
        // Apply marks in a deterministic order so nested marks compose.
        const hasBold = marks.some((m) => m.type === "bold");
        const hasItalic = marks.some((m) => m.type === "italic");
        const hasCode = marks.some((m) => m.type === "code");
        const linkMark = marks.find((m) => m.type === "link");
        if (hasCode) out = `\`${out}\``;
        if (hasBold) out = `**${out}**`;
        if (hasItalic) out = `*${out}*`;
        if (linkMark) {
          const href = (linkMark.attrs?.href as string) || "";
          if (href) out = `[${out}](${href})`;
        }
        return out;
      }
      if (node.type === "hardBreak") return "\n";
      // Some marks come through as their own nodes in older docs.
      if (typeof node.text === "string") return node.text;
      return "";
    })
    .join("");
}

/** Flatten everything in a node tree to plain text for last-resort fallback. */
function flattenText(node: TipTapNode | undefined): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  if (Array.isArray(node.content)) {
    return node.content.map(flattenText).filter(Boolean).join(" ");
  }
  return "";
}

/** Walk a node and emit one or more ConvexPress blocks. */
function nodeToBlocks(node: TipTapNode): ConvexPressBlock[] {
  if (!node || !node.type) return [];

  switch (node.type) {
    case "paragraph": {
      const body = inlineToMarkdown(node.content);
      if (!body.trim()) return [];
      return [{ id: makeBlockId(), name: "core/paragraph", version: 1, attrs: { body } }];
    }

    case "heading": {
      const text = inlineToMarkdown(node.content);
      const level = clampLevel((node.attrs?.level as number) ?? 2);
      return [
        {
          id: makeBlockId(),
          name: "core/heading",
          version: 1,
          attrs: { level, text, anchor: "" },
        },
      ];
    }

    case "bulletList":
    case "orderedList":
    case "taskList": {
      const style =
        node.type === "orderedList"
          ? "ordered"
          : node.type === "taskList"
            ? "task"
            : "bullet";
      const items: Array<{ text: string; done?: boolean }> = [];
      for (const child of node.content ?? []) {
        if (child.type === "listItem" || child.type === "taskItem") {
          const text = (child.content ?? [])
            .map((inner) => inlineToMarkdown(inner.content))
            .filter(Boolean)
            .join(" ");
          const done = child.attrs?.checked === true;
          items.push(child.type === "taskItem" ? { text, done } : { text });
        }
      }
      return [
        {
          id: makeBlockId(),
          name: "core/list",
          version: 1,
          attrs: { style, items },
        },
      ];
    }

    case "blockquote": {
      const text = (node.content ?? [])
        .map((inner) => inlineToMarkdown(inner.content))
        .filter(Boolean)
        .join("\n\n");
      return [
        {
          id: makeBlockId(),
          name: "core/quote",
          version: 1,
          attrs: { text, cite: "", source: "" },
        },
      ];
    }

    case "codeBlock": {
      const language = (node.attrs?.language as string) ?? "";
      const code = (node.content ?? [])
        .map((c) => c.text ?? "")
        .join("");
      return [
        {
          id: makeBlockId(),
          name: "core/code",
          version: 1,
          attrs: { language, code, filename: "" },
        },
      ];
    }

    case "horizontalRule":
    case "divider": {
      const variant = (node.attrs?.style as string) === "dashed" ? "subtle" : "default";
      return [
        {
          id: makeBlockId(),
          name: "core/divider",
          version: 1,
          attrs: { variant },
        },
      ];
    }

    case "spacer": {
      const heightPx = Number(node.attrs?.height) || 40;
      const size =
        heightPx <= 16 ? "small" : heightPx <= 32 ? "medium" : heightPx <= 80 ? "large" : "xlarge";
      return [
        {
          id: makeBlockId(),
          name: "core/spacer",
          version: 1,
          attrs: { size },
        },
      ];
    }

    case "image": {
      const src = (node.attrs?.src as string) ?? "";
      const alt = (node.attrs?.alt as string) ?? "";
      const caption = (node.attrs?.title as string) ?? "";
      // src is typically a URL, not a mediaId — we cannot fabricate a media row.
      // Store URL in href as a link fallback; mediaId stays empty until the
      // user re-attaches via the media picker in Phase 6.
      return [
        {
          id: makeBlockId(),
          name: "core/image",
          version: 1,
          attrs: {
            mediaId: "",
            alt,
            caption,
            href: src,
          },
        },
      ];
    }

    case "embed": {
      const url = (node.attrs?.url as string) ?? "";
      return [
        {
          id: makeBlockId(),
          name: "core/embed",
          version: 1,
          attrs: { url, caption: "" },
        },
      ];
    }

    case "callout": {
      // No callout block in the new core library yet — convert to paragraph
      // with the type as a leading marker so the user can re-style.
      const type = (node.attrs?.type as string) ?? "info";
      const inner = (node.content ?? [])
        .map((inner) => inlineToMarkdown(inner.content))
        .filter(Boolean)
        .join("\n\n");
      const prefix =
        type === "warning"
          ? "**⚠️ Warning:** "
          : type === "error"
            ? "**❌ Error:** "
            : type === "success"
              ? "**✅ Success:** "
              : "**ℹ️ Note:** ";
      return [
        {
          id: makeBlockId(),
          name: "core/paragraph",
          version: 1,
          attrs: { body: `${prefix}${inner}` },
        },
      ];
    }

    case "button": {
      const text = (node.attrs?.text as string) ?? "Button";
      const url = (node.attrs?.url as string) ?? "";
      return [
        {
          id: makeBlockId(),
          name: "core/paragraph",
          version: 1,
          attrs: { body: url ? `[${text}](${url})` : text },
        },
      ];
    }

    case "columns": {
      // Flatten columns — admin doesn't expose column layout yet.
      const out: ConvexPressBlock[] = [];
      for (const child of node.content ?? []) {
        for (const grand of child.content ?? []) {
          out.push(...nodeToBlocks(grand));
        }
      }
      return out;
    }

    case "table": {
      // Best-effort — preserve table as a paragraph with the cells joined.
      const text = flattenText(node);
      if (!text.trim()) return [];
      return [
        {
          id: makeBlockId(),
          name: "core/paragraph",
          version: 1,
          attrs: { body: text },
        },
      ];
    }

    case "doc": {
      const out: ConvexPressBlock[] = [];
      for (const child of node.content ?? []) {
        out.push(...nodeToBlocks(child));
      }
      return out;
    }

    default: {
      // Unknown node — try to recover any text content as a paragraph.
      const text = flattenText(node).trim();
      if (!text) return [];
      return [
        {
          id: makeBlockId(),
          name: "core/paragraph",
          version: 1,
          attrs: { body: text },
        },
      ];
    }
  }
}

function clampLevel(level: number): 1 | 2 | 3 | 4 | 5 | 6 {
  const n = Math.min(6, Math.max(1, Math.round(level)));
  return n as 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * Convert a TipTap content string (or pre-parsed object) into a blocks array.
 *
 * Tolerant of:
 *   - empty / null / undefined input
 *   - JSON-string input or already-parsed object
 *   - malformed JSON (returns an empty blocks array)
 *   - missing `type: "doc"` wrapper (treats input as a single node)
 *
 * Never throws — degrades to empty blocks on irrecoverable input.
 */
export function tiptapContentToBlocks(input: unknown): ConvexPressBlock[] {
  if (!input) return [];
  let parsed: TipTapNode | null = null;
  if (typeof input === "string") {
    if (!input.trim()) return [];
    try {
      parsed = JSON.parse(input) as TipTapNode;
    } catch {
      // Plain-text fallback: treat as one paragraph.
      return [
        {
          id: makeBlockId(),
          name: "core/paragraph",
          version: 1,
          attrs: { body: input },
        },
      ];
    }
  } else if (typeof input === "object") {
    parsed = input as TipTapNode;
  }
  if (!parsed) return [];
  return nodeToBlocks(parsed);
}
