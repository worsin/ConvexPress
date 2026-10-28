/**
 * Knowledge Base System - article content entry points
 *
 *   prepareKbContent(input)   write path: any accepted input to the stored
 *                             document and every field derived from it
 *   readKbDoc(raw)            read path: whatever is stored to a KbDoc; never throws
 *   renderKbDoc(doc, opts)    the shared HTML renderer (render.ts)
 *
 * Accepted input: a KbDoc (object or JSON), TipTap JSON from older builds,
 * HTML, or plain text. Stored articles always hold KbDoc JSON with
 * `contentVersion: KB_DOC_VERSION`; anything else is legacy and is converted
 * on read and by kb/contentMigration.
 */

import { ConvexError } from "convex/values";

import { kbExcerpt, kbFigureCount, kbLinkedArticleIds, kbMediaIds, kbOutline, kbPlainText, kbReadingTimeMinutes } from "./derive";
import { kbDocFromHtml, kbDocFromPlainText, looksLikeHtml } from "./fromHtml";
import { emptyKbDoc, KB_DOC_VERSION, type KbDoc, type KbOutlineEntry } from "./model";
import { normalizeKbDoc } from "./normalize";

export { KB_DOC_VERSION, type KbDoc, type KbOutlineEntry } from "./model";
export { normalizeKbDoc, safeKbHref } from "./normalize";
export { renderKbDoc, escapeKbHtml, type KbRenderMedia, type KbRenderOptions } from "./render";
export { kbPlainText, kbOutline } from "./derive";

/** The longest serialized document accepted (also bounds legacy HTML input). */
export const MAX_KB_CONTENT_BYTES = 1024 * 1024;

export type PreparedKbContent = {
  doc: KbDoc;
  /** Serialized KbDoc, the stored `content`. */
  content: string;
  contentVersion: typeof KB_DOC_VERSION;
  contentPlainText: string;
  outline: KbOutlineEntry[];
  readingTimeMinutes: number;
  excerpt: string;
  mediaIds: string[];
  linkedArticleIds: string[];
};

function parseJsonDocument(raw: string): unknown | undefined {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && Reflect.get(parsed, "type") === "doc" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function docFromString(raw: string): KbDoc {
  if (!raw.trim()) return emptyKbDoc();
  const json = parseJsonDocument(raw);
  if (json !== undefined) return normalizeKbDoc(json);
  return looksLikeHtml(raw) ? kbDocFromHtml(raw) : kbDocFromPlainText(raw);
}

export function prepareKbContent(input: string | KbDoc | undefined | null): PreparedKbContent {
  if (typeof input === "string" && input.length > MAX_KB_CONTENT_BYTES) {
    throw new ConvexError({ code: "INVALID_CONTENT", message: "Article content is too long." });
  }
  const doc = input === undefined || input === null ? emptyKbDoc() : typeof input === "string" ? docFromString(input) : normalizeKbDoc(input);
  const content = JSON.stringify(doc);
  if (content.length > MAX_KB_CONTENT_BYTES) throw new ConvexError({ code: "INVALID_CONTENT", message: "Article content is too long." });
  const contentPlainText = kbPlainText(doc);
  return {
    doc,
    content,
    contentVersion: KB_DOC_VERSION,
    contentPlainText,
    outline: kbOutline(doc),
    readingTimeMinutes: kbReadingTimeMinutes(contentPlainText, kbFigureCount(doc)),
    excerpt: kbExcerpt(doc),
    mediaIds: kbMediaIds(doc),
    linkedArticleIds: kbLinkedArticleIds(doc),
  };
}

/**
 * The document for whatever an article stores. Stored content is normalized
 * again on read, so a row written around the mutations can't reach the
 * renderer in a shape it doesn't expect. Content that can't be read at all
 * comes back as its plain text.
 */
export function readKbDoc(raw: string | undefined | null): KbDoc {
  if (!raw) return emptyKbDoc();
  try {
    return docFromString(raw);
  } catch {
    try {
      return kbDocFromPlainText(raw.replace(/<[^>]*>/g, " ").slice(0, MAX_KB_CONTENT_BYTES));
    } catch {
      return emptyKbDoc();
    }
  }
}
