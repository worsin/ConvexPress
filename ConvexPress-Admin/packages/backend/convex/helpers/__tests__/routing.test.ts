/**
 * Routing System - Unit Tests for routing.ts
 *
 * Tests permalink generation and custom structure validation.
 *
 * Run with: bun test convex/helpers/__tests__/routing.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  generatePostUrl,
  generatePageUrl,
  isValidCustomStructure,
  resolvePermalinkTags,
} from "../routing";

const publishedAt = Date.UTC(2026, 1, 8, 14, 30, 45);

describe("generatePostUrl", () => {
  const post = {
    slug: "hello-world",
    numericId: 123,
    publishedAt,
    primaryCategorySlug: "news",
    authorSlug: "editor",
  };

  test("generates plain permalinks with numeric ID", () => {
    expect(
      generatePostUrl(post, {
        structure: "plain",
        categoryBase: "category",
        tagBase: "tag",
      }),
    ).toBe("/?p=123");
  });

  test("generates numeric archive permalinks", () => {
    expect(
      generatePostUrl(post, {
        structure: "numeric",
        categoryBase: "category",
        tagBase: "tag",
      }),
    ).toBe("/archives/123");
  });

  test("generates custom permalinks with resolved tags", () => {
    expect(
      generatePostUrl(post, {
        structure: "custom",
        customStructure: "/blog/%year%/%monthnum%/%postname%/",
        categoryBase: "category",
        tagBase: "tag",
      }),
    ).toBe("/blog/2026/02/hello-world/");
  });
});

describe("resolvePermalinkTags", () => {
  test("fills all supported high-value permalink tags", () => {
    expect(
      resolvePermalinkTags("%year%/%monthnum%/%day%/%author%/%category%/%post_id%/%postname%", {
        slug: "launch-post",
        numericId: 88,
        publishedAt,
        primaryCategorySlug: "product",
        authorSlug: "casey",
      }),
    ).toBe("/2026/02/08/casey/product/88/launch-post/");
  });

  test("falls back for missing optional custom permalink fields", () => {
    expect(
      resolvePermalinkTags("/%category%/%author%/%post_id%/", {
        slug: "fallback-post",
      }),
    ).toBe("/uncategorized/unknown/0/");
  });
});

describe("generatePageUrl", () => {
  test("uses the hierarchical page path when provided", () => {
    expect(
      generatePageUrl({
        slug: "leadership",
        fullPath: "about/team/leadership",
      }),
    ).toBe("/about/team/leadership/");
  });
});

describe("isValidCustomStructure", () => {
  test("requires a unique post-identifying tag", () => {
    expect(isValidCustomStructure("/blog/%year%/%postname%/")).toBe(true);
    expect(isValidCustomStructure("/blog/%year%/%monthnum%/")).toBe(false);
  });
});
