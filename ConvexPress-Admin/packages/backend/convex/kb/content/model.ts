/**
 * Knowledge Base System - Article document model (KbDoc v1)
 *
 * Every article body is one KbDoc: ProseMirror JSON with a fixed node and mark
 * set. The names match TipTap's, so the admin editor reads and writes it
 * directly. Writers send only the document. The server normalizes it
 * (kb/content/normalize.ts) and derives everything else from it: the sanitized
 * HTML (render.ts), the plain text, outline, excerpt, reading time, and the
 * media and article references (derive.ts).
 *
 * This module and normalize/render/derive import nothing but `convex/values`,
 * so the admin editor and its preview share them with the server.
 */

export const KB_DOC_VERSION = 1 as const;

/**
 * Version of an article's stored body and the fields derived from it
 * (`contentVersion`): 1 = KbDoc with plain text, outline and links;
 * 2 = also `searchText`. kb/contentMigration brings older rows up to date.
 */
export const KB_STORED_CONTENT_VERSION = 2 as const;

export const KB_CALLOUT_TONES = ["note", "tip", "warning", "important"] as const;
export type KbCalloutTone = (typeof KB_CALLOUT_TONES)[number];

export const KB_FIGURE_SIZES = ["content", "wide", "full"] as const;
export type KbFigureSize = (typeof KB_FIGURE_SIZES)[number];

export const KB_FIGURE_FRAMES = ["none", "screenshot"] as const;
export type KbFigureFrame = (typeof KB_FIGURE_FRAMES)[number];

export const KB_LIST_KINDS = ["list", "steps"] as const;
export type KbListKind = (typeof KB_LIST_KINDS)[number];

export type KbMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "strike" }
  | { type: "code" }
  | { type: "kbd" }
  /** The name of a control as the reader sees it on screen, such as the Save button. */
  | { type: "ui" }
  /** Either a URL, or another article by id (and optionally one of its headings). */
  | { type: "link"; attrs: { href: string | null; articleId: string | null; anchor: string | null } };

export type KbText = { type: "text"; text: string; marks?: KbMark[] };
export type KbHardBreak = { type: "hardBreak" };
export type KbInline = KbText | KbHardBreak;

export type KbParagraph = { type: "paragraph"; content?: KbInline[] };
export type KbHeading = { type: "heading"; attrs: { level: 2 | 3 | 4; id: string }; content?: KbInline[] };
export type KbListItem = { type: "listItem"; content: KbBlock[] };
export type KbBulletList = { type: "bulletList"; content: KbListItem[] };
export type KbOrderedList = { type: "orderedList"; attrs: { start: number; kind: KbListKind }; content: KbListItem[] };
export type KbBlockquote = { type: "blockquote"; content: KbBlock[] };
export type KbCallout = { type: "callout"; attrs: { tone: KbCalloutTone; title: string }; content: KbBlock[] };
export type KbFigure = {
  type: "figure";
  attrs: {
    /** A media library item. Exactly one of mediaId and src is set. */
    mediaId: string | null;
    /** An image outside the media library (legacy imports): https or site-relative. */
    src: string | null;
    alt: string;
    caption: string;
    size: KbFigureSize;
    frame: KbFigureFrame;
  };
};
export type KbCodeBlock = { type: "codeBlock"; attrs: { language: string }; content?: KbText[] };
export type KbHorizontalRule = { type: "horizontalRule" };
export type KbTableCell = { type: "tableCell" | "tableHeader"; attrs: { colspan: number; rowspan: number }; content: KbBlock[] };
export type KbTableRow = { type: "tableRow"; content: KbTableCell[] };
export type KbTable = { type: "table"; content: KbTableRow[] };
export type KbDetails = { type: "details"; attrs: { summary: string; open: boolean }; content: KbBlock[] };

export type KbBlock =
  | KbParagraph
  | KbHeading
  | KbBulletList
  | KbOrderedList
  | KbBlockquote
  | KbCallout
  | KbFigure
  | KbCodeBlock
  | KbHorizontalRule
  | KbTable
  | KbDetails;

export type KbDoc = { type: "doc"; attrs: { version: typeof KB_DOC_VERSION }; content: KbBlock[] };

export type KbOutlineEntry = { id: string; level: 2 | 3 | 4; text: string };

export const KB_DOC_LIMITS = {
  /** Every node and mark counted together. */
  nodes: 20_000,
  depth: 24,
  textCharacters: 1_000_000,
  tableRows: 100,
  tableColumns: 12,
  altCharacters: 500,
  captionCharacters: 1_000,
  calloutTitleCharacters: 120,
  summaryCharacters: 300,
  headingIdCharacters: 64,
  languageCharacters: 32,
  urlCharacters: 2_048,
  figures: 100,
} as const;

/**
 * The shape of a document id. It only screens out junk; the server resolves
 * every id against its table (ctx.db.normalizeId) before trusting it.
 */
export const CONVEX_ID_PATTERN = /^[A-Za-z0-9_]{16,64}$/;

export function emptyKbDoc(): KbDoc {
  return { type: "doc", attrs: { version: KB_DOC_VERSION }, content: [] };
}
