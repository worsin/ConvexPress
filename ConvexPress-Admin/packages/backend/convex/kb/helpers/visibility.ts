/**
 * Knowledge Base System - Article Visibility and Audiences
 *
 * `visibility` decides whether an article can ever reach the public website.
 * An "internal" article is for trusted server-side integrations only (for
 * example the in-app help panel of a separate application). No public read,
 * listing, count, search index, RAG store, collection, comment or feedback
 * path may expose it.
 *
 * Storage is canonical: an internal article stores `visibility: "internal"`
 * and a public article stores nothing. Absent therefore means public, so
 * articles written before this field existed stay public without a
 * migration, and every public index selects `visibility === undefined`
 * exactly (see PUBLIC_VISIBILITY_KEY). ConvexPress writers go through
 * storedKbVisibility and never store the "public" literal. A "public" literal
 * written around these helpers is still public to the single-article gate,
 * but index-backed public listings leave it out: the mismatch fails closed.
 *
 * `audiences` are free-form, site-defined labels for integrators (for example
 * "doctor" or "staff"). ConvexPress validates and stores them but never
 * interprets them, and no public read returns them.
 *
 * This module only imports `convex/values`, so the admin app can share the
 * same audience rules.
 */

import { ConvexError, v } from "convex/values";

export const kbArticleVisibilityValidator = v.union(v.literal("public"), v.literal("internal"));
export type KbArticleVisibility = "public" | "internal";

/** The index key public listings select: public articles store no visibility. */
export const PUBLIC_VISIBILITY_KEY = undefined;

/** Maximum audiences per article, after normalization and deduplication. */
export const MAX_KB_AUDIENCES = 16;
/** Raw entries accepted before normalization; bounds work on hostile input. */
const MAX_RAW_KB_AUDIENCES = 64;
/** A lowercase slug-like label of 1–48 characters. */
export const KB_AUDIENCE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/;

type VisibilityFields = { visibility?: KbArticleVisibility };

export function isInternalKbArticle(article: VisibilityFields): boolean {
  return article.visibility === "internal";
}

/** The effective visibility of a stored article (absent means public). */
export function kbArticleVisibility(article: VisibilityFields): KbArticleVisibility {
  return article.visibility === "internal" ? "internal" : "public";
}

/** The stored form of a requested visibility: "internal", or absent for public. */
export function storedKbVisibility(visibility: KbArticleVisibility): "internal" | undefined {
  return visibility === "internal" ? "internal" : undefined;
}

/**
 * Whether an article contributes to public category, tag and collection
 * counts. Only published, non-internal articles do.
 */
export function countsAsPublicKbArticle(article: VisibilityFields & { status: string }): boolean {
  return article.status === "published" && !isInternalKbArticle(article);
}

/** Normalize one audience label, or return null when it is not valid. */
export function parseKbAudience(raw: string): string | null {
  const audience = raw.trim().toLowerCase();
  return KB_AUDIENCE_PATTERN.test(audience) ? audience : null;
}

/**
 * Validate audience labels for storage: each is trimmed and lowercased, must
 * match KB_AUDIENCE_PATTERN, duplicates collapse to the first occurrence, and
 * at most MAX_KB_AUDIENCES remain.
 */
export function normalizeKbAudiences(input: readonly string[]): string[] {
  if (input.length > MAX_RAW_KB_AUDIENCES) {
    throw new ConvexError({ code: "VALIDATION_ERROR", message: `An article can have at most ${MAX_KB_AUDIENCES} audiences.` });
  }
  const audiences: string[] = [];
  for (const raw of input) {
    const audience = parseKbAudience(raw);
    if (audience === null) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Audience ${JSON.stringify(raw.trim().slice(0, 48))} is invalid. Use 1–48 lowercase letters, digits, hyphens or underscores, starting with a letter or digit.`,
      });
    }
    if (!audiences.includes(audience)) audiences.push(audience);
  }
  if (audiences.length > MAX_KB_AUDIENCES) {
    throw new ConvexError({ code: "VALIDATION_ERROR", message: `An article can have at most ${MAX_KB_AUDIENCES} audiences.` });
  }
  return audiences;
}

/** The stored form of requested audiences: the normalized list, or absent when empty. */
export function storedKbAudiences(input: readonly string[]): string[] | undefined {
  const audiences = normalizeKbAudiences(input);
  return audiences.length > 0 ? audiences : undefined;
}
