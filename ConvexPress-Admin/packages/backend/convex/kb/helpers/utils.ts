/**
 * Knowledge Base System - Utility Helpers
 *
 * Slug generation for KB tables (not using the posts table, so needs
 * its own uniqueness checks), plaintext extraction from TipTap JSON,
 * and reading time calculation.
 *
 * Usage:
 *   import { generateKbSlug, extractPlainText, calculateReadingTime } from "./helpers/utils";
 */

import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

/** Maximum slug length in characters. */
const MAX_SLUG_LENGTH = 200;

/** Average words per minute for reading time calculation. */
const WORDS_PER_MINUTE = 200;

// ─── Slug Generation ────────────────────────────────────────────────────────

/**
 * Slugify a title string into a URL-safe slug.
 *
 * Rules:
 *   - Lowercase
 *   - Replace spaces, underscores with hyphens
 *   - Remove non-alphanumeric except hyphens
 *   - Collapse consecutive hyphens
 *   - Trim leading/trailing hyphens
 *   - Truncate to MAX_SLUG_LENGTH
 *   - Fallback to "untitled" if empty result
 */
export function slugify(title: string): string {
  let slug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SLUG_LENGTH);

  if (!slug) slug = "untitled";
  return slug;
}

/**
 * Generate a unique slug for a KB article.
 *
 * Checks the kb_articles table's by_slug index to ensure uniqueness.
 * If a conflict exists, appends -2, -3, etc. until unique.
 *
 * @param ctx - Convex MutationCtx
 * @param title - The title to derive the slug from
 * @param existingArticleId - If updating, exclude this article from uniqueness check
 * @returns A unique slug string
 */
export async function generateArticleSlug(
  ctx: MutationCtx,
  title: string,
  existingArticleId?: Id<"kb_articles">,
): Promise<string> {
  const base = slugify(title);
  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("kb_articles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (!existing || (existingArticleId && existing._id === existingArticleId)) {
      break;
    }

    slug = `${base}-${suffix}`;
    suffix++;

    if (suffix > 1000) {
      slug = `${base}-${Date.now()}`;
      break;
    }
  }

  return slug;
}

/**
 * Generate a unique slug for a KB category.
 *
 * @param ctx - Convex MutationCtx
 * @param name - The category name to derive the slug from
 * @param existingCategoryId - If updating, exclude this category from uniqueness check
 * @returns A unique slug string
 */
export async function generateCategorySlug(
  ctx: MutationCtx,
  name: string,
  existingCategoryId?: Id<"kb_categories">,
): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("kb_categories")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (!existing || (existingCategoryId && existing._id === existingCategoryId)) {
      break;
    }

    slug = `${base}-${suffix}`;
    suffix++;

    if (suffix > 1000) {
      slug = `${base}-${Date.now()}`;
      break;
    }
  }

  return slug;
}

/**
 * Generate a unique slug for a KB tag.
 *
 * @param ctx - Convex MutationCtx
 * @param name - The tag name to derive the slug from
 * @param existingTagId - If updating, exclude this tag from uniqueness check
 * @returns A unique slug string
 */
export async function generateTagSlug(
  ctx: MutationCtx,
  name: string,
  existingTagId?: Id<"kb_tags">,
): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("kb_tags")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (!existing || (existingTagId && existing._id === existingTagId)) {
      break;
    }

    slug = `${base}-${suffix}`;
    suffix++;

    if (suffix > 1000) {
      slug = `${base}-${Date.now()}`;
      break;
    }
  }

  return slug;
}

/**
 * Generate a unique slug for a KB collection.
 *
 * @param ctx - Convex MutationCtx
 * @param name - The collection name to derive the slug from
 * @param existingCollectionId - If updating, exclude from uniqueness check
 * @returns A unique slug string
 */
export async function generateCollectionSlug(
  ctx: MutationCtx,
  name: string,
  existingCollectionId?: Id<"kb_collections">,
): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("kb_collections")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (!existing || (existingCollectionId && existing._id === existingCollectionId)) {
      break;
    }

    slug = `${base}-${suffix}`;
    suffix++;

    if (suffix > 1000) {
      slug = `${base}-${Date.now()}`;
      break;
    }
  }

  return slug;
}

/**
 * Generate a unique slug for a KB template.
 *
 * @param ctx - Convex MutationCtx
 * @param name - The template name to derive the slug from
 * @param existingTemplateId - If updating, exclude from uniqueness check
 * @returns A unique slug string
 */
export async function generateTemplateSlug(
  ctx: MutationCtx,
  name: string,
  existingTemplateId?: Id<"kb_templates">,
): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("kb_templates")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (!existing || (existingTemplateId && existing._id === existingTemplateId)) {
      break;
    }

    slug = `${base}-${suffix}`;
    suffix++;

    if (suffix > 1000) {
      slug = `${base}-${Date.now()}`;
      break;
    }
  }

  return slug;
}

// ─── Content Processing ─────────────────────────────────────────────────────

/**
 * Extract plain text from TipTap JSON content.
 *
 * Recursively walks the TipTap JSON document tree and extracts all
 * text content, joining with spaces. Used for:
 *   - Convex searchIndex population (contentPlainText field)
 *   - Reading time calculation
 *   - Excerpt auto-generation
 *
 * @param jsonContent - Serialized TipTap JSON string
 * @returns Plain text string with no HTML/formatting
 */
export function extractPlainText(jsonContent: string): string {
  try {
    const doc = JSON.parse(jsonContent);
    return extractTextFromNode(doc).trim();
  } catch {
    // If JSON parsing fails, return the raw string (may already be plain text)
    return jsonContent;
  }
}

/** TipTap JSON node types for recursive text extraction. */
interface TipTapTextNode {
  type: "text";
  text: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

interface TipTapBlockNode {
  type: string;
  content?: TipTapNode[];
  attrs?: Record<string, unknown>;
}

type TipTapNode = TipTapTextNode | TipTapBlockNode;

/**
 * Recursively extract text from a TipTap JSON node.
 */
function extractTextFromNode(node: TipTapNode): string {
  if (!node) return "";

  // Text node -- return the text content
  if (node.type === "text" && "text" in node && typeof node.text === "string") {
    return node.text;
  }

  // Container node -- recurse into children
  if ("content" in node && Array.isArray(node.content)) {
    const childTexts = node.content.map((child) => extractTextFromNode(child));
    // Add newlines between block-level nodes
    const blockTypes = [
      "paragraph", "heading", "blockquote", "codeBlock",
      "bulletList", "orderedList", "listItem", "horizontalRule",
    ];
    if (blockTypes.includes(node.type)) {
      return childTexts.join(" ") + "\n";
    }
    return childTexts.join(" ");
  }

  return "";
}

/**
 * Calculate estimated reading time in minutes from plain text.
 *
 * Uses 200 words per minute as the average reading speed.
 * Returns a minimum of 1 minute.
 *
 * @param plainText - The plain text content
 * @returns Reading time in minutes (integer, minimum 1)
 */
export function calculateReadingTime(plainText: string): number {
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  const minutes = Math.ceil(wordCount / WORDS_PER_MINUTE);
  return Math.max(1, minutes);
}

/**
 * Auto-generate an excerpt from plain text content.
 *
 * Takes the first 300 characters and truncates at the last word boundary.
 *
 * @param plainText - The plain text content
 * @param maxLength - Maximum excerpt length (default 300)
 * @returns Truncated excerpt string
 */
export function generateExcerpt(plainText: string, maxLength = 300): string {
  if (plainText.length <= maxLength) return plainText;

  const truncated = plainText.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.5) {
    return truncated.slice(0, lastSpace) + "...";
  }
  return truncated + "...";
}
