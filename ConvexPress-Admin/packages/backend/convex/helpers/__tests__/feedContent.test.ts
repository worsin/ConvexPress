/**
 * RSS/Feed System - Unit Tests for feedContent.ts
 *
 * Tests content sanitization, excerpt generation, and block editor detection.
 *
 * Run with: bun test convex/helpers/__tests__/feedContent.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  formatContentForFeed,
  formatExcerptForFeed,
  isBlockEditorJson,
} from "../feedContent";

// ─── formatContentForFeed ───────────────────────────────────────────────────

describe("formatContentForFeed", () => {
  const siteUrl = "https://example.com";

  test("returns empty string for empty content", () => {
    expect(formatContentForFeed("", siteUrl)).toBe("");
  });

  test("converts relative URLs to absolute", () => {
    const html = '<img src="/images/photo.jpg" />';
    const result = formatContentForFeed(html, siteUrl);
    expect(result).toContain('src="https://example.com/images/photo.jpg"');
  });

  test("does not double-absolutize already absolute URLs", () => {
    const html = '<img src="https://other.com/photo.jpg" />';
    const result = formatContentForFeed(html, siteUrl);
    expect(result).toContain('src="https://other.com/photo.jpg"');
  });

  test("converts relative href to absolute", () => {
    const html = '<a href="/about">About</a>';
    const result = formatContentForFeed(html, siteUrl);
    expect(result).toContain('href="https://example.com/about"');
  });

  test("does not modify protocol-relative URLs", () => {
    const html = '<img src="//cdn.example.com/photo.jpg" />';
    const result = formatContentForFeed(html, siteUrl);
    expect(result).toContain('src="//cdn.example.com/photo.jpg"');
  });

  test("strips script tags with content", () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    const result = formatContentForFeed(html, siteUrl);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>Hello</p>");
    expect(result).toContain("<p>World</p>");
  });

  test("strips self-closing script tags", () => {
    const html = '<p>Hello</p><script src="evil.js" />';
    const result = formatContentForFeed(html, siteUrl);
    expect(result).not.toContain("<script");
  });

  test("strips javascript: URLs in href", () => {
    const html = '<a href="javascript:alert(1)">Click</a>';
    const result = formatContentForFeed(html, siteUrl);
    expect(result).not.toContain("javascript:");
    expect(result).toContain('href="#"');
  });

  test("strips javascript: URLs in src", () => {
    const html = '<img src="javascript:alert(1)" />';
    const result = formatContentForFeed(html, siteUrl);
    expect(result).not.toContain("javascript:");
    expect(result).toContain('src=""');
  });

  test("strips on* event handlers", () => {
    const html = '<div onclick="alert(1)" onmouseover="evil()">Text</div>';
    const result = formatContentForFeed(html, siteUrl);
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("onmouseover");
    expect(result).toContain("Text</div>");
  });

  test("converts iframes with src to links", () => {
    const html =
      '<iframe src="https://youtube.com/embed/123" title="My Video"></iframe>';
    const result = formatContentForFeed(html, siteUrl);
    expect(result).not.toContain("<iframe");
    expect(result).toContain("https://youtube.com/embed/123");
    // The regex extracts src as link text; title capture is best-effort
    expect(result).toContain("<a href=");
  });

  test("strips iframes without src", () => {
    const html = "<iframe></iframe>";
    const result = formatContentForFeed(html, siteUrl);
    expect(result).not.toContain("<iframe");
  });

  test("strips form elements", () => {
    const html =
      '<form action="/submit"><input type="text" /><button>Submit</button></form>';
    const result = formatContentForFeed(html, siteUrl);
    expect(result).not.toContain("<form");
    expect(result).not.toContain("<input");
    expect(result).not.toContain("<button");
  });

  test("strips dangerous position:fixed styles", () => {
    const html = '<div style="position: fixed; top: 0;">Overlay</div>';
    const result = formatContentForFeed(html, siteUrl);
    expect(result).not.toContain("position");
    expect(result).not.toContain("style=");
  });

  test("strips dangerous position:absolute styles", () => {
    const html = '<div style="position: absolute; z-index: 9999;">Popup</div>';
    const result = formatContentForFeed(html, siteUrl);
    expect(result).not.toContain("position");
    expect(result).not.toContain("style=");
  });

  test("adds empty alt to images missing alt attribute", () => {
    const html = '<img src="photo.jpg" />';
    const result = formatContentForFeed(html, siteUrl);
    expect(result).toContain('alt=""');
  });

  test("does not modify images with existing alt", () => {
    const html = '<img src="photo.jpg" alt="A photo" />';
    const result = formatContentForFeed(html, siteUrl);
    expect(result).toContain('alt="A photo"');
    // Should not have double alt
    const altCount = (result.match(/alt=/g) || []).length;
    expect(altCount).toBe(1);
  });

  test("handles trailing slash in siteUrl", () => {
    const html = '<img src="/photo.jpg" />';
    const result = formatContentForFeed(html, "https://example.com/");
    expect(result).toContain('src="https://example.com/photo.jpg"');
  });
});

// ─── formatExcerptForFeed ───────────────────────────────────────────────────

describe("formatExcerptForFeed", () => {
  test("returns manual excerpt when present", () => {
    const result = formatExcerptForFeed({
      excerpt: "This is my custom excerpt.",
      content: "<p>Long content here...</p>",
    });
    expect(result).toBe("This is my custom excerpt.");
  });

  test("trims whitespace from manual excerpt", () => {
    const result = formatExcerptForFeed({
      excerpt: "  Custom excerpt  ",
      content: "<p>Content</p>",
    });
    expect(result).toBe("Custom excerpt");
  });

  test("falls back to content when excerpt is empty", () => {
    const result = formatExcerptForFeed({
      excerpt: "",
      content: "<p>Hello world content here.</p>",
    });
    expect(result).toBe("Hello world content here.");
  });

  test("falls back to content when excerpt is null", () => {
    const result = formatExcerptForFeed({
      excerpt: null,
      content: "<p>Content here.</p>",
    });
    expect(result).toBe("Content here.");
  });

  test("strips HTML tags from content", () => {
    const result = formatExcerptForFeed({
      content: "<h1>Title</h1> <p>Body text</p>",
    });
    expect(result).toBe("Title Body text");
  });

  test("decodes HTML entities", () => {
    const result = formatExcerptForFeed({
      content: "<p>Tom &amp; Jerry are &quot;friends&quot;</p>",
    });
    expect(result).toContain('Tom & Jerry are "friends"');
  });

  test("decodes &nbsp; as space", () => {
    const result = formatExcerptForFeed({
      content: "<p>Hello&nbsp;World</p>",
    });
    expect(result).toContain("Hello World");
  });

  test("collapses whitespace", () => {
    const result = formatExcerptForFeed({
      content: "<p>  Multiple   spaces   here  </p>",
    });
    expect(result).toBe("Multiple spaces here");
  });

  test("truncates at word boundary when content exceeds maxLength", () => {
    const longContent =
      "<p>" + "word ".repeat(100) + "</p>";
    const result = formatExcerptForFeed({ content: longContent }, 50);
    expect(result.length).toBeLessThanOrEqual(55); // 50 + "..."
    expect(result).toEndWith("...");
  });

  test("does not truncate content shorter than maxLength", () => {
    const result = formatExcerptForFeed(
      { content: "<p>Short content.</p>" },
      300,
    );
    expect(result).toBe("Short content.");
    expect(result).not.toContain("...");
  });

  test("returns empty string for null content", () => {
    const result = formatExcerptForFeed({ content: null });
    expect(result).toBe("");
  });

  test("returns empty string for empty content", () => {
    const result = formatExcerptForFeed({ content: "" });
    expect(result).toBe("");
  });

  test("uses custom maxLength", () => {
    const content = "<p>" + "a".repeat(500) + "</p>";
    const result = formatExcerptForFeed({ content }, 100);
    // Should be truncated (100 chars + "...")
    expect(result.length).toBeLessThanOrEqual(104);
  });
});

// ─── isBlockEditorJson ──────────────────────────────────────────────────────

describe("isBlockEditorJson", () => {
  test("detects array-format block editor JSON", () => {
    const json = JSON.stringify([
      { type: "paragraph", content: "Hello" },
    ]);
    expect(isBlockEditorJson(json)).toBe(true);
  });

  test("detects object-format block editor JSON", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
    expect(isBlockEditorJson(json)).toBe(true);
  });

  test("returns false for plain HTML", () => {
    expect(isBlockEditorJson("<p>Hello</p>")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isBlockEditorJson("")).toBe(false);
  });

  test("returns false for plain text", () => {
    expect(isBlockEditorJson("Hello world")).toBe(false);
  });

  test("returns false for invalid JSON that looks like it", () => {
    expect(isBlockEditorJson('[{"type": invalid}')).toBe(false);
  });

  test("returns false for JSON without type key", () => {
    const json = JSON.stringify({ name: "test", value: 123 });
    expect(isBlockEditorJson(json)).toBe(false);
  });
});
