/**
 * RSS/Feed System - Unit Tests for feedUrls.ts
 *
 * Tests feed URL generation and content type helpers.
 *
 * Run with: bun test convex/helpers/__tests__/feedUrls.test.ts
 */

import { describe, expect, test } from "bun:test";
import { getFeedUrl, getFeedContentType } from "../feedUrls";

// ─── getFeedUrl ─────────────────────────────────────────────────────────────

describe("getFeedUrl", () => {
  const siteUrl = "https://example.com";

  // Main feed
  test("main feed (default RSS)", () => {
    expect(getFeedUrl(siteUrl, "main")).toBe(
      "https://example.com/api/feed",
    );
  });

  test("main feed (explicit atom)", () => {
    expect(getFeedUrl(siteUrl, "main", undefined, "atom")).toBe(
      "https://example.com/api/feed/atom",
    );
  });

  test("main feed (explicit rss2 - no suffix)", () => {
    expect(getFeedUrl(siteUrl, "main", undefined, "rss2")).toBe(
      "https://example.com/api/feed",
    );
  });

  // Category feed
  test("category feed (RSS)", () => {
    expect(getFeedUrl(siteUrl, "category", "news")).toBe(
      "https://example.com/api/category/news/feed",
    );
  });

  test("category feed (Atom)", () => {
    expect(getFeedUrl(siteUrl, "category", "news", "atom")).toBe(
      "https://example.com/api/category/news/feed/atom",
    );
  });

  test("category feed throws without slug", () => {
    expect(() => getFeedUrl(siteUrl, "category")).toThrow(
      "Category feed requires a slug",
    );
  });

  // Tag feed
  test("tag feed (RSS)", () => {
    expect(getFeedUrl(siteUrl, "tag", "react")).toBe(
      "https://example.com/api/tag/react/feed",
    );
  });

  test("tag feed (Atom)", () => {
    expect(getFeedUrl(siteUrl, "tag", "react", "atom")).toBe(
      "https://example.com/api/tag/react/feed/atom",
    );
  });

  test("tag feed throws without slug", () => {
    expect(() => getFeedUrl(siteUrl, "tag")).toThrow(
      "Tag feed requires a slug",
    );
  });

  // Author feed
  test("author feed (RSS)", () => {
    expect(getFeedUrl(siteUrl, "author", "john")).toBe(
      "https://example.com/api/author/john/feed",
    );
  });

  test("author feed (Atom)", () => {
    expect(getFeedUrl(siteUrl, "author", "john", "atom")).toBe(
      "https://example.com/api/author/john/feed/atom",
    );
  });

  test("author feed throws without slug", () => {
    expect(() => getFeedUrl(siteUrl, "author")).toThrow(
      "Author feed requires a slug",
    );
  });

  // Comments feed
  test("global comments feed (RSS)", () => {
    expect(getFeedUrl(siteUrl, "comments")).toBe(
      "https://example.com/api/comments/feed",
    );
  });

  test("global comments feed (Atom)", () => {
    expect(getFeedUrl(siteUrl, "comments", undefined, "atom")).toBe(
      "https://example.com/api/comments/feed/atom",
    );
  });

  // Post comments feed
  test("post comments feed (RSS)", () => {
    expect(getFeedUrl(siteUrl, "postComments", "hello-world")).toBe(
      "https://example.com/api/blog/hello-world/feed",
    );
  });

  test("post comments feed (Atom)", () => {
    expect(
      getFeedUrl(siteUrl, "postComments", "hello-world", "atom"),
    ).toBe("https://example.com/api/blog/hello-world/feed/atom");
  });

  test("post comments feed throws without slug", () => {
    expect(() => getFeedUrl(siteUrl, "postComments")).toThrow(
      "Post comment feed requires a slug",
    );
  });

  // Edge cases
  test("strips trailing slash from siteUrl", () => {
    expect(getFeedUrl("https://example.com/", "main")).toBe(
      "https://example.com/api/feed",
    );
  });

  test("strips multiple trailing slashes", () => {
    expect(getFeedUrl("https://example.com///", "main")).toBe(
      "https://example.com/api/feed",
    );
  });

  test("handles siteUrl with path", () => {
    expect(getFeedUrl("https://example.com/blog", "main")).toBe(
      "https://example.com/blog/api/feed",
    );
  });

  test("throws for unknown feed type", () => {
    expect(() =>
      getFeedUrl(siteUrl, "invalid" as any),
    ).toThrow("Unknown feed type");
  });
});

// ─── getFeedContentType ─────────────────────────────────────────────────────

describe("getFeedContentType", () => {
  test("returns RSS content type for rss2", () => {
    expect(getFeedContentType("rss2")).toBe(
      "application/rss+xml; charset=UTF-8",
    );
  });

  test("returns Atom content type for atom", () => {
    expect(getFeedContentType("atom")).toBe(
      "application/atom+xml; charset=UTF-8",
    );
  });
});
