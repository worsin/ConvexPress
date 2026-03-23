/**
 * RSS/Feed System - Feed Response Builder
 *
 * Shared helper used by all feed API routes to:
 *   1. Create a ConvexHttpClient and fetch feed settings + data
 *   2. Transform enriched posts/comments into XML feed items
 *   3. Build complete RSS 2.0 or Atom 1.0 XML
 *   4. Set proper HTTP caching headers (Cache-Control, ETag, Last-Modified, X-Robots-Tag)
 *   5. Handle conditional requests (If-None-Match -> 304 Not Modified)
 *   6. Return a Response object with the XML body
 *
 * This avoids duplicating feed-building logic across 12 route files.
 *
 * Feed utility functions (XML escaping, date formatting, content sanitization,
 * URL generation, ETag generation) are imported from `./feedUtils.ts` -- the
 * single source of truth for the ConvexPress-Website. The ConvexPress-Admin backend has parallel
 * copies in convex/helpers/feedXml.ts, feedContent.ts, feedUrls.ts for the
 * alternative Convex HTTP Actions approach (Option B) and unit testing.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "@convexpress-website/backend/generated/api";

import type {
  EnrichedFeedPost,
  EnrichedFeedComment,
  PostCommentData,
  FeedConfig,
} from "./types";
import { POST_FEED_MAX_AGE, COMMENT_FEED_MAX_AGE } from "./constants";
import {
  escapeXml,
  escapeCdata,
  toRfc2822,
  toIso8601,
  formatContentForFeed,
  formatExcerptForFeed,
  getFeedUrl,
  generateETag,
} from "./feedUtils";

// ─── Convex Client Singleton ─────────────────────────────────────────────────

const CONVEX_URL = process.env.VITE_CONVEX_URL;
if (!CONVEX_URL) {
  console.warn(
    "[RSS/Feed System] VITE_CONVEX_URL is not set - all feed requests will fail",
  );
}

/** Module-level singleton ConvexHttpClient. Reused across all feed requests. */
let _convexClient: ConvexHttpClient | null = null;

function getConvexClient(): ConvexHttpClient {
  if (!_convexClient) {
    if (!CONVEX_URL) {
      throw new Error("VITE_CONVEX_URL environment variable is not configured");
    }
    _convexClient = new ConvexHttpClient(CONVEX_URL);
  }
  return _convexClient;
}

// ─── RSS 2.0 Post Item Builder ──────────────────────────────────────────────

function buildRssItem(post: EnrichedFeedPost, settings: FeedConfig): string {
  const siteUrl = settings.siteUrl.replace(/\/+$/, "");
  const postUrl = `${siteUrl}/blog/${post.slug}`;
  const commentsUrl = `${postUrl}#comments`;

  const content =
    settings.feedContentDisplay === "full"
      ? formatContentForFeed(post.content, settings.siteUrl)
      : "";

  const excerpt = formatExcerptForFeed(post);

  const categoryTags = [...post.categories, ...post.tags]
    .map((cat) => `      <category><![CDATA[${escapeCdata(cat)}]]></category>`)
    .join("\n");

  const enclosureTag = post.featuredImageUrl
    ? `      <enclosure url="${escapeXml(post.featuredImageUrl)}" length="${post.featuredImageSize || 0}" type="${escapeXml(post.featuredImageMimeType || "image/jpeg")}" />`
    : "";

  const commentsTag = post.commentCount > 0
    ? `      <comments>${escapeXml(commentsUrl)}</comments>\n      <slash:comments>${post.commentCount}</slash:comments>`
    : "";

  return `    <item>
      <title><![CDATA[${escapeCdata(post.title)}]]></title>
      <link>${escapeXml(postUrl)}</link>
      <guid isPermaLink="true">${escapeXml(postUrl)}</guid>
      <pubDate>${toRfc2822(post.publishedAt)}</pubDate>
      <dc:creator><![CDATA[${escapeCdata(post.authorName)}]]></dc:creator>
${categoryTags ? categoryTags + "\n" : ""}      <description><![CDATA[${escapeCdata(excerpt)}]]></description>
      <content:encoded><![CDATA[${escapeCdata(content || excerpt)}]]></content:encoded>
${commentsTag ? commentsTag + "\n" : ""}${enclosureTag ? enclosureTag + "\n" : ""}    </item>`;
}

// ─── RSS 2.0 Channel Builder ────────────────────────────────────────────────

function buildRssChannel(
  title: string,
  description: string,
  link: string,
  feedUrl: string,
  language: string,
  lastBuildDate: number,
  items: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:sy="http://purl.org/rss/1.0/modules/syndication/"
  xmlns:slash="http://purl.org/rss/1.0/modules/slash/"
  xmlns:media="http://search.yahoo.com/mrss/"
>
  <channel>
    <title><![CDATA[${escapeCdata(title)}]]></title>
    <link>${escapeXml(link)}</link>
    <description><![CDATA[${escapeCdata(description)}]]></description>
    <language>${escapeXml(language)}</language>
    <lastBuildDate>${toRfc2822(lastBuildDate)}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <sy:updatePeriod>hourly</sy:updatePeriod>
    <sy:updateFrequency>1</sy:updateFrequency>
    <generator>SmithHarper CMS</generator>
${items}
  </channel>
</rss>`;
}

// ─── Atom 1.0 Entry Builder ─────────────────────────────────────────────────

function buildAtomEntry(post: EnrichedFeedPost, settings: FeedConfig): string {
  const siteUrl = settings.siteUrl.replace(/\/+$/, "");
  const postUrl = `${siteUrl}/blog/${post.slug}`;

  const content =
    settings.feedContentDisplay === "full"
      ? formatContentForFeed(post.content, settings.siteUrl)
      : "";

  const excerpt = formatExcerptForFeed(post);

  const categoryTags = [...post.categories, ...post.tags]
    .map(
      (cat) =>
        `      <category term="${escapeXml(cat)}" label="${escapeXml(cat)}" />`,
    )
    .join("\n");

  const enclosureTag = post.featuredImageUrl
    ? `      <link rel="enclosure" href="${escapeXml(post.featuredImageUrl)}" type="${escapeXml(post.featuredImageMimeType || "image/jpeg")}" length="${post.featuredImageSize || 0}" />`
    : "";

  return `    <entry>
      <title type="html"><![CDATA[${escapeCdata(post.title)}]]></title>
      <link href="${escapeXml(postUrl)}" rel="alternate" type="text/html" />
      <id>${escapeXml(postUrl)}</id>
      <published>${toIso8601(post.publishedAt)}</published>
      <updated>${toIso8601(post.updatedAt)}</updated>
      <author>
        <name>${escapeXml(post.authorName)}</name>
      </author>
${categoryTags ? categoryTags + "\n" : ""}      <summary type="html"><![CDATA[${escapeCdata(excerpt)}]]></summary>
      <content type="html"><![CDATA[${escapeCdata(content || excerpt)}]]></content>
${enclosureTag ? enclosureTag + "\n" : ""}    </entry>`;
}

// ─── Atom 1.0 Feed Builder ─────────────────────────────────────────────────

function buildAtomFeed(
  title: string,
  subtitle: string,
  link: string,
  feedUrl: string,
  id: string,
  language: string,
  updated: number,
  entries: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${escapeXml(language)}">
    <title type="text">${escapeXml(title)}</title>
    <subtitle type="text">${escapeXml(subtitle)}</subtitle>
    <link href="${escapeXml(link)}" rel="alternate" type="text/html" />
    <link href="${escapeXml(feedUrl)}" rel="self" type="application/atom+xml" />
    <id>${escapeXml(id)}</id>
    <updated>${toIso8601(updated)}</updated>
    <generator uri="https://smithharper.dev" version="1.0">SmithHarper CMS</generator>
${entries}
</feed>`;
}

// ─── Comment RSS Item Builder ───────────────────────────────────────────────

function buildRssCommentItem(
  comment: EnrichedFeedComment | (PostCommentData & { postTitle: string; postSlug: string }),
  siteUrl: string,
): string {
  const base = siteUrl.replace(/\/+$/, "");
  const postUrl = `${base}/blog/${comment.postSlug}`;
  const commentUrl = `${postUrl}#comment-${comment._id}`;

  return `    <item>
      <title><![CDATA[${escapeCdata(`Comment on "${comment.postTitle}" by ${comment.authorName}`)}]]></title>
      <link>${escapeXml(commentUrl)}</link>
      <guid isPermaLink="false">${escapeXml(commentUrl)}</guid>
      <pubDate>${toRfc2822(comment.createdAt)}</pubDate>
      <dc:creator><![CDATA[${escapeCdata(comment.authorName)}]]></dc:creator>
      <description><![CDATA[${escapeCdata(comment.content)}]]></description>
    </item>`;
}

// ─── Comment Atom Entry Builder ─────────────────────────────────────────────

function buildAtomCommentEntry(
  comment: EnrichedFeedComment | (PostCommentData & { postTitle: string; postSlug: string }),
  siteUrl: string,
): string {
  const base = siteUrl.replace(/\/+$/, "");
  const postUrl = `${base}/blog/${comment.postSlug}`;
  const commentUrl = `${postUrl}#comment-${comment._id}`;

  return `    <entry>
      <title type="text">Comment on "${escapeXml(comment.postTitle)}" by ${escapeXml(comment.authorName)}</title>
      <link href="${escapeXml(commentUrl)}" rel="alternate" type="text/html" />
      <id>${escapeXml(commentUrl)}</id>
      <published>${toIso8601(comment.createdAt)}</published>
      <updated>${toIso8601(comment.updatedAt)}</updated>
      <author>
        <name>${escapeXml(comment.authorName)}</name>
      </author>
      <content type="html"><![CDATA[${escapeCdata(comment.content)}]]></content>
    </entry>`;
}

// ─── Response Helpers ───────────────────────────────────────────────────────

function makeHeaders(
  contentType: string,
  maxAge: number,
  etag: string,
  lastModified: number,
): Record<string, string> {
  return {
    "Content-Type": contentType,
    "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}`,
    ETag: etag,
    "Last-Modified": toRfc2822(lastModified),
    "X-Robots-Tag": "noindex",
  };
}

function check304(request: Request, etag: string): Response | null {
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304 });
  }
  return null;
}

function errorResponse(message: string, status: number = 500): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=UTF-8" },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API - used by feed API routes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build and return the main post feed (RSS 2.0).
 */
export async function buildMainRssFeed(request: Request): Promise<Response> {
  try {
    const client = getConvexClient();
    const settings: FeedConfig = await client.query(api.feeds.queries.getFeedSettings, {});
    const posts: EnrichedFeedPost[] = await client.query(
      api.feeds.queries.getPublishedPosts,
      { limit: settings.feedItemCount },
    );

    const siteUrl = settings.siteUrl.replace(/\/+$/, "");
    const feedUrl = getFeedUrl(siteUrl, "main");
    const lastBuildDate = posts.length > 0
      ? Math.max(...posts.map((p) => p.publishedAt))
      : Date.now();
    const etag = generateETag(lastBuildDate, posts.length);

    const notModified = check304(request, etag);
    if (notModified) return notModified;

    const items = posts.map((p) => buildRssItem(p, settings)).join("\n");
    const xml = buildRssChannel(
      settings.siteTitle,
      settings.siteDescription,
      siteUrl,
      feedUrl,
      settings.language,
      lastBuildDate,
      items,
    );

    return new Response(xml, {
      status: 200,
      headers: makeHeaders("application/rss+xml; charset=UTF-8", POST_FEED_MAX_AGE, etag, lastBuildDate),
    });
  } catch (error: unknown) {
    console.error("Failed to build main RSS feed:", error);
    return errorResponse("Internal Server Error");
  }
}

/**
 * Build and return the main post feed (Atom 1.0).
 */
export async function buildMainAtomFeed(request: Request): Promise<Response> {
  try {
    const client = getConvexClient();
    const settings: FeedConfig = await client.query(api.feeds.queries.getFeedSettings, {});
    const posts: EnrichedFeedPost[] = await client.query(
      api.feeds.queries.getPublishedPosts,
      { limit: settings.feedItemCount },
    );

    const siteUrl = settings.siteUrl.replace(/\/+$/, "");
    const feedUrl = getFeedUrl(siteUrl, "main", undefined, "atom");
    const lastUpdated = posts.length > 0
      ? Math.max(...posts.map((p) => p.updatedAt))
      : Date.now();
    const etag = generateETag(lastUpdated, posts.length);

    const notModified = check304(request, etag);
    if (notModified) return notModified;

    const entries = posts.map((p) => buildAtomEntry(p, settings)).join("\n");
    const xml = buildAtomFeed(
      settings.siteTitle,
      settings.siteDescription,
      siteUrl,
      feedUrl,
      feedUrl,
      settings.language,
      lastUpdated,
      entries,
    );

    return new Response(xml, {
      status: 200,
      headers: makeHeaders("application/atom+xml; charset=UTF-8", POST_FEED_MAX_AGE, etag, lastUpdated),
    });
  } catch (error: unknown) {
    console.error("Failed to build main Atom feed:", error);
    return errorResponse("Internal Server Error");
  }
}

/**
 * Build and return a category post feed.
 */
export async function buildCategoryFeed(
  request: Request,
  slug: string,
  format: "rss2" | "atom",
): Promise<Response> {
  try {
    const client = getConvexClient();
    const settings: FeedConfig = await client.query(api.feeds.queries.getFeedSettings, {});
    const result = await client.query(api.feeds.queries.getPostsByCategory, {
      categorySlug: slug,
      limit: settings.feedItemCount,
    });

    if (!result) return errorResponse("Category not found", 404);

    const { category, posts } = result as {
      category: { name: string; slug: string; description: string };
      posts: EnrichedFeedPost[];
    };

    const siteUrl = settings.siteUrl.replace(/\/+$/, "");
    const feedUrl = getFeedUrl(siteUrl, "category", slug, format);
    const link = `${siteUrl}/category/${slug}`;
    const title = `${category.name} - ${settings.siteTitle}`;
    const description = category.description;
    const lastDate = posts.length > 0
      ? Math.max(...posts.map((p) => p.publishedAt))
      : Date.now();
    const etag = generateETag(lastDate, posts.length);

    const notModified = check304(request, etag);
    if (notModified) return notModified;

    const contentType = format === "atom"
      ? "application/atom+xml; charset=UTF-8"
      : "application/rss+xml; charset=UTF-8";

    let xml: string;
    if (format === "atom") {
      const entries = posts.map((p) => buildAtomEntry(p, settings)).join("\n");
      xml = buildAtomFeed(title, description, link, feedUrl, feedUrl, settings.language, lastDate, entries);
    } else {
      const items = posts.map((p) => buildRssItem(p, settings)).join("\n");
      xml = buildRssChannel(title, description, link, feedUrl, settings.language, lastDate, items);
    }

    return new Response(xml, {
      status: 200,
      headers: makeHeaders(contentType, POST_FEED_MAX_AGE, etag, lastDate),
    });
  } catch (error: unknown) {
    console.error("Failed to build category feed:", error);
    return errorResponse("Internal Server Error");
  }
}

/**
 * Build and return a tag post feed.
 */
export async function buildTagFeed(
  request: Request,
  slug: string,
  format: "rss2" | "atom",
): Promise<Response> {
  try {
    const client = getConvexClient();
    const settings: FeedConfig = await client.query(api.feeds.queries.getFeedSettings, {});
    const result = await client.query(api.feeds.queries.getPostsByTag, {
      tagSlug: slug,
      limit: settings.feedItemCount,
    });

    if (!result) return errorResponse("Tag not found", 404);

    const { tag, posts } = result as {
      tag: { name: string; slug: string; description: string };
      posts: EnrichedFeedPost[];
    };

    const siteUrl = settings.siteUrl.replace(/\/+$/, "");
    const feedUrl = getFeedUrl(siteUrl, "tag", slug, format);
    const link = `${siteUrl}/tag/${slug}`;
    const title = `${tag.name} - ${settings.siteTitle}`;
    const description = tag.description;
    const lastDate = posts.length > 0
      ? Math.max(...posts.map((p) => p.publishedAt))
      : Date.now();
    const etag = generateETag(lastDate, posts.length);

    const notModified = check304(request, etag);
    if (notModified) return notModified;

    const contentType = format === "atom"
      ? "application/atom+xml; charset=UTF-8"
      : "application/rss+xml; charset=UTF-8";

    let xml: string;
    if (format === "atom") {
      const entries = posts.map((p) => buildAtomEntry(p, settings)).join("\n");
      xml = buildAtomFeed(title, description, link, feedUrl, feedUrl, settings.language, lastDate, entries);
    } else {
      const items = posts.map((p) => buildRssItem(p, settings)).join("\n");
      xml = buildRssChannel(title, description, link, feedUrl, settings.language, lastDate, items);
    }

    return new Response(xml, {
      status: 200,
      headers: makeHeaders(contentType, POST_FEED_MAX_AGE, etag, lastDate),
    });
  } catch (error: unknown) {
    console.error("Failed to build tag feed:", error);
    return errorResponse("Internal Server Error");
  }
}

/**
 * Build and return an author post feed.
 */
export async function buildAuthorFeed(
  request: Request,
  slug: string,
  format: "rss2" | "atom",
): Promise<Response> {
  try {
    const client = getConvexClient();
    const settings: FeedConfig = await client.query(api.feeds.queries.getFeedSettings, {});
    const result = await client.query(api.feeds.queries.getPostsByAuthor, {
      authorSlug: slug,
      limit: settings.feedItemCount,
    });

    if (!result) return errorResponse("Author not found", 404);

    const { author, posts } = result as {
      author: { name: string; slug: string };
      posts: EnrichedFeedPost[];
    };

    const siteUrl = settings.siteUrl.replace(/\/+$/, "");
    const feedUrl = getFeedUrl(siteUrl, "author", slug, format);
    const link = `${siteUrl}/author/${slug}`;
    const title = `Posts by ${author.name} - ${settings.siteTitle}`;
    const description = `Posts by ${author.name}`;
    const lastDate = posts.length > 0
      ? Math.max(...posts.map((p) => p.publishedAt))
      : Date.now();
    const etag = generateETag(lastDate, posts.length);

    const notModified = check304(request, etag);
    if (notModified) return notModified;

    const contentType = format === "atom"
      ? "application/atom+xml; charset=UTF-8"
      : "application/rss+xml; charset=UTF-8";

    let xml: string;
    if (format === "atom") {
      const entries = posts.map((p) => buildAtomEntry(p, settings)).join("\n");
      xml = buildAtomFeed(title, description, link, feedUrl, feedUrl, settings.language, lastDate, entries);
    } else {
      const items = posts.map((p) => buildRssItem(p, settings)).join("\n");
      xml = buildRssChannel(title, description, link, feedUrl, settings.language, lastDate, items);
    }

    return new Response(xml, {
      status: 200,
      headers: makeHeaders(contentType, POST_FEED_MAX_AGE, etag, lastDate),
    });
  } catch (error: unknown) {
    console.error("Failed to build author feed:", error);
    return errorResponse("Internal Server Error");
  }
}

/**
 * Build and return the global comment feed.
 */
export async function buildCommentsFeed(
  request: Request,
  format: "rss2" | "atom",
): Promise<Response> {
  try {
    const client = getConvexClient();
    const settings: FeedConfig = await client.query(api.feeds.queries.getFeedSettings, {});
    const comments: EnrichedFeedComment[] = await client.query(
      api.feeds.queries.getRecentComments,
      { limit: settings.feedItemCount },
    );

    const siteUrl = settings.siteUrl.replace(/\/+$/, "");
    const feedUrl = getFeedUrl(siteUrl, "comments", undefined, format);
    const title = `Comments for ${settings.siteTitle}`;
    const description = `Recent comments on ${settings.siteTitle}`;
    const lastDate = comments.length > 0
      ? Math.max(...comments.map((c) => c.createdAt))
      : Date.now();
    const etag = generateETag(lastDate, comments.length);

    const notModified = check304(request, etag);
    if (notModified) return notModified;

    const contentType = format === "atom"
      ? "application/atom+xml; charset=UTF-8"
      : "application/rss+xml; charset=UTF-8";

    let xml: string;
    if (format === "atom") {
      const entries = comments
        .map((c) => buildAtomCommentEntry(c, siteUrl))
        .join("\n");
      xml = buildAtomFeed(
        title,
        description,
        siteUrl,
        feedUrl,
        feedUrl,
        settings.language,
        lastDate,
        entries,
      );
    } else {
      const items = comments
        .map((c) => buildRssCommentItem(c, siteUrl))
        .join("\n");
      xml = buildRssChannel(
        title,
        description,
        siteUrl,
        feedUrl,
        settings.language,
        lastDate,
        items,
      );
    }

    return new Response(xml, {
      status: 200,
      headers: makeHeaders(contentType, COMMENT_FEED_MAX_AGE, etag, lastDate),
    });
  } catch (error: unknown) {
    console.error("Failed to build comments feed:", error);
    return errorResponse("Internal Server Error");
  }
}

/**
 * Build and return a per-post comment feed.
 */
export async function buildPostCommentsFeed(
  request: Request,
  slug: string,
  format: "rss2" | "atom",
): Promise<Response> {
  try {
    const client = getConvexClient();
    const settings: FeedConfig = await client.query(api.feeds.queries.getFeedSettings, {});
    const result = await client.query(api.feeds.queries.getPostComments, {
      postSlug: slug,
      limit: settings.feedItemCount,
    });

    if (!result) return errorResponse("Post not found", 404);

    const { post, comments } = result as {
      post: { title: string; slug: string; commentStatus: string };
      comments: PostCommentData[];
    };

    const siteUrl = settings.siteUrl.replace(/\/+$/, "");
    const feedUrl = getFeedUrl(siteUrl, "postComments", slug, format);
    const link = `${siteUrl}/blog/${slug}`;
    const title = `Comments on "${post.title}" - ${settings.siteTitle}`;
    const description = `Comments on "${post.title}"`;
    const lastDate = comments.length > 0
      ? Math.max(...comments.map((c) => c.createdAt))
      : Date.now();
    const etag = generateETag(lastDate, comments.length);

    const notModified = check304(request, etag);
    if (notModified) return notModified;

    // Enrich comments with post info for the builders
    const enrichedComments = comments.map((c) => ({
      ...c,
      postTitle: post.title,
      postSlug: post.slug,
    }));

    const contentType = format === "atom"
      ? "application/atom+xml; charset=UTF-8"
      : "application/rss+xml; charset=UTF-8";

    let xml: string;
    if (format === "atom") {
      const entries = enrichedComments
        .map((c) => buildAtomCommentEntry(c, siteUrl))
        .join("\n");
      xml = buildAtomFeed(
        title,
        description,
        link,
        feedUrl,
        feedUrl,
        settings.language,
        lastDate,
        entries,
      );
    } else {
      const items = enrichedComments
        .map((c) => buildRssCommentItem(c, siteUrl))
        .join("\n");
      xml = buildRssChannel(
        title,
        description,
        link,
        feedUrl,
        settings.language,
        lastDate,
        items,
      );
    }

    return new Response(xml, {
      status: 200,
      headers: makeHeaders(contentType, COMMENT_FEED_MAX_AGE, etag, lastDate),
    });
  } catch (error: unknown) {
    console.error("Failed to build post comments feed:", error);
    return errorResponse("Internal Server Error");
  }
}
