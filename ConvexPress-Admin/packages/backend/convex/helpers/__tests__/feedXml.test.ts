/**
 * RSS/Feed System - Unit Tests for feedXml.ts
 *
 * Tests XML escaping, CDATA escaping, date formatting, ETag generation,
 * and XML builder output structure.
 *
 * Run with: bun test convex/helpers/__tests__/feedXml.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  escapeXml,
  escapeCdata,
  toRfc2822,
  toIso8601,
  generateETag,
  buildRssChannel,
  buildRssItem,
  buildAtomFeed,
  buildAtomEntry,
  buildRssCommentItem,
  buildAtomCommentEntry,
  buildRssCommentChannel,
  buildAtomCommentFeed,
  type RssChannelConfig,
  type RssFeedItem,
  type AtomFeedConfig,
  type AtomFeedEntry,
  type CommentRssItem,
  type CommentAtomEntry,
} from "../feedXml";

// ─── escapeXml ──────────────────────────────────────────────────────────────

describe("escapeXml", () => {
  test("escapes ampersand", () => {
    expect(escapeXml("foo & bar")).toBe("foo &amp; bar");
  });

  test("escapes less-than", () => {
    expect(escapeXml("<tag>")).toBe("&lt;tag&gt;");
  });

  test("escapes greater-than", () => {
    expect(escapeXml("a > b")).toBe("a &gt; b");
  });

  test("escapes double quote", () => {
    expect(escapeXml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  test("escapes single quote (apostrophe)", () => {
    expect(escapeXml("it's")).toBe("it&apos;s");
  });

  test("handles empty string", () => {
    expect(escapeXml("")).toBe("");
  });

  test("escapes multiple special characters together", () => {
    expect(escapeXml('<a href="test&param">it\'s</a>')).toBe(
      "&lt;a href=&quot;test&amp;param&quot;&gt;it&apos;s&lt;/a&gt;"
    );
  });

  test("leaves safe text unchanged", () => {
    expect(escapeXml("Hello World 123")).toBe("Hello World 123");
  });

  test("handles unicode characters without modification", () => {
    expect(escapeXml("Hello \u{1F600} World")).toBe("Hello \u{1F600} World");
  });

  test("handles CJK characters", () => {
    expect(escapeXml("Hello \u4F60\u597D")).toBe("Hello \u4F60\u597D");
  });

  test("handles RTL text", () => {
    expect(escapeXml("\u0645\u0631\u062D\u0628\u0627")).toBe(
      "\u0645\u0631\u062D\u0628\u0627"
    );
  });
});

// ─── escapeCdata ────────────────────────────────────────────────────────────

describe("escapeCdata", () => {
  test("escapes ]]> sequence", () => {
    expect(escapeCdata("foo]]>bar")).toBe("foo]]]]><![CDATA[>bar");
  });

  test("handles multiple ]]> sequences", () => {
    expect(escapeCdata("a]]>b]]>c")).toBe(
      "a]]]]><![CDATA[>b]]]]><![CDATA[>c"
    );
  });

  test("leaves safe text unchanged", () => {
    expect(escapeCdata("Hello World")).toBe("Hello World");
  });

  test("handles empty string", () => {
    expect(escapeCdata("")).toBe("");
  });

  test("handles partial ]] without >", () => {
    expect(escapeCdata("foo]]bar")).toBe("foo]]bar");
  });
});

// ─── toRfc2822 ──────────────────────────────────────────────────────────────

describe("toRfc2822", () => {
  test("formats a known date correctly", () => {
    // 2026-02-08T14:30:00Z = 1770684600000 ms
    const timestamp = Date.UTC(2026, 1, 8, 14, 30, 0);
    expect(toRfc2822(timestamp)).toBe("Sun, 08 Feb 2026 14:30:00 +0000");
  });

  test("formats midnight UTC correctly", () => {
    const timestamp = Date.UTC(2025, 0, 1, 0, 0, 0);
    expect(toRfc2822(timestamp)).toBe("Wed, 01 Jan 2025 00:00:00 +0000");
  });

  test("formats end of year correctly", () => {
    const timestamp = Date.UTC(2025, 11, 31, 23, 59, 59);
    expect(toRfc2822(timestamp)).toBe("Wed, 31 Dec 2025 23:59:59 +0000");
  });

  test("pads single-digit day", () => {
    const timestamp = Date.UTC(2026, 2, 5, 10, 0, 0);
    const result = toRfc2822(timestamp);
    expect(result).toContain("05 Mar");
  });

  test("pads single-digit hours/minutes/seconds", () => {
    const timestamp = Date.UTC(2026, 0, 1, 3, 5, 7);
    const result = toRfc2822(timestamp);
    expect(result).toContain("03:05:07");
  });
});

// ─── toIso8601 ──────────────────────────────────────────────────────────────

describe("toIso8601", () => {
  test("formats a known date correctly", () => {
    const timestamp = Date.UTC(2026, 1, 8, 14, 30, 0);
    expect(toIso8601(timestamp)).toBe("2026-02-08T14:30:00.000Z");
  });

  test("formats epoch zero", () => {
    expect(toIso8601(0)).toBe("1970-01-01T00:00:00.000Z");
  });

  test("preserves millisecond precision", () => {
    const timestamp = Date.UTC(2026, 5, 15, 12, 30, 45, 123);
    expect(toIso8601(timestamp)).toBe("2026-06-15T12:30:45.123Z");
  });
});

// ─── generateETag ───────────────────────────────────────────────────────────

describe("generateETag", () => {
  test("generates correct format", () => {
    expect(generateETag(1234567890, 10)).toBe('"1234567890-10"');
  });

  test("includes surrounding quotes", () => {
    const etag = generateETag(100, 5);
    expect(etag.startsWith('"')).toBe(true);
    expect(etag.endsWith('"')).toBe(true);
  });

  test("handles zero values", () => {
    expect(generateETag(0, 0)).toBe('"0-0"');
  });
});

// ─── buildRssItem ───────────────────────────────────────────────────────────

describe("buildRssItem", () => {
  const baseItem: RssFeedItem = {
    title: "Test Post",
    link: "https://example.com/blog/test-post",
    guid: "https://example.com/blog/test-post",
    pubDate: Date.UTC(2026, 1, 8, 14, 30, 0),
    creator: "John Doe",
    categories: ["News", "Tech"],
    description: "A test post excerpt",
    contentEncoded: "<p>Full post content</p>",
    commentCount: 5,
    commentsUrl: "https://example.com/blog/test-post#comments",
  };

  test("wraps title in CDATA", () => {
    const xml = buildRssItem(baseItem);
    expect(xml).toContain("<title><![CDATA[Test Post]]></title>");
  });

  test("includes link and guid", () => {
    const xml = buildRssItem(baseItem);
    expect(xml).toContain(
      "<link>https://example.com/blog/test-post</link>"
    );
    expect(xml).toContain(
      '<guid isPermaLink="true">https://example.com/blog/test-post</guid>'
    );
  });

  test("includes pubDate in RFC 2822 format", () => {
    const xml = buildRssItem(baseItem);
    expect(xml).toContain(
      "<pubDate>Sun, 08 Feb 2026 14:30:00 +0000</pubDate>"
    );
  });

  test("includes dc:creator in CDATA", () => {
    const xml = buildRssItem(baseItem);
    expect(xml).toContain(
      "<dc:creator><![CDATA[John Doe]]></dc:creator>"
    );
  });

  test("includes category tags in CDATA", () => {
    const xml = buildRssItem(baseItem);
    expect(xml).toContain(
      "<category><![CDATA[News]]></category>"
    );
    expect(xml).toContain(
      "<category><![CDATA[Tech]]></category>"
    );
  });

  test("includes content:encoded in CDATA", () => {
    const xml = buildRssItem(baseItem);
    expect(xml).toContain(
      "<content:encoded><![CDATA[<p>Full post content</p>]]></content:encoded>"
    );
  });

  test("includes comments and slash:comments when commentCount > 0", () => {
    const xml = buildRssItem(baseItem);
    expect(xml).toContain("<comments>");
    expect(xml).toContain("<slash:comments>5</slash:comments>");
  });

  test("omits comments tags when commentCount is 0", () => {
    const item = { ...baseItem, commentCount: 0 };
    const xml = buildRssItem(item);
    expect(xml).not.toContain("<comments>");
    expect(xml).not.toContain("<slash:comments>");
  });

  test("includes enclosure when present", () => {
    const item: RssFeedItem = {
      ...baseItem,
      enclosure: {
        url: "https://example.com/image.jpg",
        length: 12345,
        type: "image/jpeg",
      },
    };
    const xml = buildRssItem(item);
    expect(xml).toContain('url="https://example.com/image.jpg"');
    expect(xml).toContain('length="12345"');
    expect(xml).toContain('type="image/jpeg"');
  });

  test("omits enclosure when not present", () => {
    const xml = buildRssItem(baseItem);
    expect(xml).not.toContain("<enclosure");
  });
});

// ─── buildRssChannel ────────────────────────────────────────────────────────

describe("buildRssChannel", () => {
  const config: RssChannelConfig = {
    title: "My Blog",
    description: "A test blog",
    link: "https://example.com",
    feedUrl: "https://example.com/api/feed",
    language: "en-US",
    lastBuildDate: Date.UTC(2026, 1, 8, 14, 30, 0),
    items: [],
  };

  test("starts with XML declaration", () => {
    const xml = buildRssChannel(config);
    expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
  });

  test("includes rss 2.0 root element with namespaces", () => {
    const xml = buildRssChannel(config);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("xmlns:content=");
    expect(xml).toContain("xmlns:dc=");
    expect(xml).toContain("xmlns:atom=");
    expect(xml).toContain("xmlns:sy=");
    expect(xml).toContain("xmlns:slash=");
    expect(xml).toContain("xmlns:media=");
  });

  test("includes channel metadata", () => {
    const xml = buildRssChannel(config);
    expect(xml).toContain("<title><![CDATA[My Blog]]></title>");
    expect(xml).toContain(
      "<description><![CDATA[A test blog]]></description>"
    );
    expect(xml).toContain("<link>https://example.com</link>");
    expect(xml).toContain("<language>en-US</language>");
  });

  test("includes atom:link self reference", () => {
    const xml = buildRssChannel(config);
    expect(xml).toContain(
      'href="https://example.com/api/feed" rel="self"'
    );
  });

  test("includes syndication elements", () => {
    const xml = buildRssChannel(config);
    expect(xml).toContain(
      "<sy:updatePeriod>hourly</sy:updatePeriod>"
    );
    expect(xml).toContain(
      "<sy:updateFrequency>1</sy:updateFrequency>"
    );
  });

  test("includes generator", () => {
    const xml = buildRssChannel(config);
    expect(xml).toContain("<generator>ConvexPress</generator>");
  });

  test("produces valid structure when items are empty", () => {
    const xml = buildRssChannel(config);
    expect(xml).toContain("<channel>");
    expect(xml).toContain("</channel>");
    expect(xml).toContain("</rss>");
  });
});

// ─── buildAtomEntry ─────────────────────────────────────────────────────────

describe("buildAtomEntry", () => {
  const baseEntry: AtomFeedEntry = {
    title: "Test Post",
    link: "https://example.com/blog/test-post",
    id: "https://example.com/blog/test-post",
    published: Date.UTC(2026, 1, 8, 14, 30, 0),
    updated: Date.UTC(2026, 1, 8, 15, 0, 0),
    author: { name: "John Doe" },
    categories: [
      { term: "news", label: "News" },
      { term: "tech", label: "Tech" },
    ],
    summary: "A test post excerpt",
    content: "<p>Full post content</p>",
  };

  test("includes title in CDATA", () => {
    const xml = buildAtomEntry(baseEntry);
    expect(xml).toContain(
      '<title type="html"><![CDATA[Test Post]]></title>'
    );
  });

  test("includes link with rel alternate", () => {
    const xml = buildAtomEntry(baseEntry);
    expect(xml).toContain(
      'href="https://example.com/blog/test-post" rel="alternate"'
    );
  });

  test("includes published and updated in ISO 8601", () => {
    const xml = buildAtomEntry(baseEntry);
    expect(xml).toContain("<published>2026-02-08T14:30:00.000Z</published>");
    expect(xml).toContain("<updated>2026-02-08T15:00:00.000Z</updated>");
  });

  test("includes author name", () => {
    const xml = buildAtomEntry(baseEntry);
    expect(xml).toContain("<name>John Doe</name>");
  });

  test("includes category elements with term and label", () => {
    const xml = buildAtomEntry(baseEntry);
    expect(xml).toContain('term="news" label="News"');
    expect(xml).toContain('term="tech" label="Tech"');
  });

  test("includes summary and content", () => {
    const xml = buildAtomEntry(baseEntry);
    expect(xml).toContain(
      '<summary type="html"><![CDATA[A test post excerpt]]></summary>'
    );
    expect(xml).toContain(
      '<content type="html"><![CDATA[<p>Full post content</p>]]></content>'
    );
  });
});

// ─── buildAtomFeed ──────────────────────────────────────────────────────────

describe("buildAtomFeed", () => {
  const config: AtomFeedConfig = {
    title: "My Blog",
    subtitle: "A test blog",
    link: "https://example.com",
    feedUrl: "https://example.com/api/feed/atom",
    id: "https://example.com/api/feed/atom",
    language: "en-US",
    updated: Date.UTC(2026, 1, 8, 14, 30, 0),
    entries: [],
  };

  test("starts with XML declaration", () => {
    const xml = buildAtomFeed(config);
    expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
  });

  test("includes Atom namespace", () => {
    const xml = buildAtomFeed(config);
    expect(xml).toContain('xmlns="http://www.w3.org/2005/Atom"');
  });

  test("includes feed metadata", () => {
    const xml = buildAtomFeed(config);
    expect(xml).toContain("<title type=\"text\">My Blog</title>");
    expect(xml).toContain("<subtitle type=\"text\">A test blog</subtitle>");
    expect(xml).toContain("<updated>2026-02-08T14:30:00.000Z</updated>");
  });

  test("includes self link and alternate link", () => {
    const xml = buildAtomFeed(config);
    expect(xml).toContain(
      'href="https://example.com" rel="alternate"'
    );
    expect(xml).toContain(
      'href="https://example.com/api/feed/atom" rel="self"'
    );
  });

  test("includes generator", () => {
    const xml = buildAtomFeed(config);
    expect(xml).toContain("ConvexPress</generator>");
  });
});

// ─── Comment builders ───────────────────────────────────────────────────────

describe("buildRssCommentItem", () => {
  const item: CommentRssItem = {
    title: 'Comment on "Test" by Alice',
    link: "https://example.com/blog/test#comment-abc",
    guid: "https://example.com/blog/test#comment-abc",
    pubDate: Date.UTC(2026, 1, 8, 14, 30, 0),
    creator: "Alice",
    description: "Great post!",
  };

  test("wraps title in CDATA", () => {
    const xml = buildRssCommentItem(item);
    expect(xml).toContain("<title><![CDATA[");
    expect(xml).toContain("Comment on");
  });

  test("uses isPermaLink=false for guid", () => {
    const xml = buildRssCommentItem(item);
    expect(xml).toContain('isPermaLink="false"');
  });
});

describe("buildAtomCommentEntry", () => {
  const entry: CommentAtomEntry = {
    title: 'Comment on "Test" by Alice',
    link: "https://example.com/blog/test#comment-abc",
    id: "https://example.com/blog/test#comment-abc",
    published: Date.UTC(2026, 1, 8, 14, 30, 0),
    updated: Date.UTC(2026, 1, 8, 14, 30, 0),
    author: { name: "Alice" },
    content: "Great post!",
  };

  test("uses text type for title", () => {
    const xml = buildAtomCommentEntry(entry);
    expect(xml).toContain('<title type="text">');
  });

  test("includes author name", () => {
    const xml = buildAtomCommentEntry(entry);
    expect(xml).toContain("<name>Alice</name>");
  });
});
