/**
 * RSS/Feed System - XML Builder Utilities
 *
 * Type-safe, testable functions for generating standards-compliant RSS 2.0
 * and Atom 1.0 XML documents. Uses template literal string building (no DOM
 * serialization) for optimal performance in Convex's server environment.
 *
 * Generated feeds conform to:
 *   - RSS 2.0: https://www.rssboard.org/rss-specification
 *   - Atom 1.0 (RFC 4287): https://www.rfc-editor.org/rfc/rfc4287
 *   - W3C Feed Validation: https://validator.w3.org/feed/
 *
 * WordPress equivalent: feed-rss2.php, feed-atom.php template rendering
 *
 * DUPLICATION NOTE: These functions are duplicated in the ConvexPress-Website at
 * `ConvexPress-Website/apps/web/src/lib/feeds/buildFeedResponse.ts`. The ConvexPress-Website
 * version is the one actively serving feeds via TanStack Start API routes
 * (Option A). These backend helpers are retained for the alternative Convex
 * HTTP Actions approach (Option B) and for unit testing. When modifying
 * XML generation logic, ensure both locations stay in sync.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RssChannelConfig {
  /** Feed title (e.g., "My Site" or "News - My Site") */
  title: string;
  /** Feed description/subtitle */
  description: string;
  /** Canonical URL of the site or archive page */
  link: string;
  /** Self-referencing feed URL (for atom:link rel="self") */
  feedUrl: string;
  /** Language code (e.g., "en-US") */
  language: string;
  /** Last build timestamp (ms since epoch) */
  lastBuildDate: number;
  /** Feed items */
  items: RssFeedItem[];
}

export interface RssFeedItem {
  /** Item title */
  title: string;
  /** Permalink to the post */
  link: string;
  /** Globally unique identifier (permalink) */
  guid: string;
  /** Publication timestamp (ms since epoch) */
  pubDate: number;
  /** Author display name */
  creator: string;
  /** Category names */
  categories: string[];
  /** Plain text description / excerpt */
  description: string;
  /** Full HTML content for content:encoded */
  contentEncoded: string;
  /** Number of comments on the post */
  commentCount: number;
  /** URL to the post's comments */
  commentsUrl: string;
  /** Optional media enclosure (featured image) */
  enclosure?: {
    url: string;
    length: number;
    type: string;
  };
}

export interface AtomFeedConfig {
  /** Feed title */
  title: string;
  /** Feed subtitle */
  subtitle: string;
  /** Canonical URL of the site or archive page */
  link: string;
  /** Self-referencing feed URL */
  feedUrl: string;
  /** Feed unique ID (typically the feed URL) */
  id: string;
  /** Language code */
  language: string;
  /** Last updated timestamp (ms since epoch) */
  updated: number;
  /** Feed entries */
  entries: AtomFeedEntry[];
}

export interface AtomFeedEntry {
  /** Entry title */
  title: string;
  /** Permalink to the post */
  link: string;
  /** Unique ID for this entry (typically the permalink) */
  id: string;
  /** Publication timestamp (ms since epoch) */
  published: number;
  /** Last updated timestamp (ms since epoch) */
  updated: number;
  /** Author information */
  author: { name: string };
  /** Category terms */
  categories: Array<{ term: string; label: string }>;
  /** Plain text summary / excerpt */
  summary: string;
  /** Full HTML content */
  content: string;
  /** Optional media enclosure (featured image) */
  enclosure?: { href: string; type: string; length: number };
}

export interface CommentRssItem {
  /** Item title (e.g., 'Comment on "Post Title" by Author') */
  title: string;
  /** Link to the comment anchor on the post page */
  link: string;
  /** Globally unique identifier */
  guid: string;
  /** Publication timestamp (ms since epoch) */
  pubDate: number;
  /** Comment author display name */
  creator: string;
  /** Comment content (plain text) */
  description: string;
}

export interface CommentAtomEntry {
  /** Entry title */
  title: string;
  /** Link to the comment anchor */
  link: string;
  /** Unique ID */
  id: string;
  /** Publication timestamp (ms since epoch) */
  published: number;
  /** Last updated timestamp (ms since epoch) */
  updated: number;
  /** Comment author name */
  author: { name: string };
  /** Comment content (plain text) */
  content: string;
}

// ─── XML Escaping ───────────────────────────────────────────────────────────

/**
 * Escape special XML characters to prevent injection.
 * Handles the five predefined XML entities: & < > " '
 *
 * @param str - Raw string to escape
 * @returns XML-safe string
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Escape content for safe inclusion inside a CDATA section.
 * The only sequence that can break a CDATA section is `]]>`.
 * We split it using the standard technique: close the CDATA section,
 * output `>` as character data, then re-open a new CDATA section.
 *
 * Example: `foo]]>bar` becomes `foo]]]]><![CDATA[>bar`
 *
 * @param str - Raw string to include in CDATA
 * @returns CDATA-safe string
 */
export function escapeCdata(str: string): string {
  return str.replace(/\]\]>/g, "]]]]><![CDATA[>");
}

// ─── Date Formatting ────────────────────────────────────────────────────────

/** Days of the week abbreviated for RFC 2822 */
const RFC2822_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Months abbreviated for RFC 2822 */
const RFC2822_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format a Unix timestamp (ms) as an RFC 2822 date string.
 * Used for RSS `<pubDate>` and `<lastBuildDate>` elements.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns RFC 2822 formatted date (e.g., "Thu, 08 Feb 2026 14:30:00 +0000")
 */
export function toRfc2822(timestamp: number): string {
  const d = new Date(timestamp);
  const day = RFC2822_DAYS[d.getUTCDay()];
  const date = String(d.getUTCDate()).padStart(2, "0");
  const month = RFC2822_MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  const seconds = String(d.getUTCSeconds()).padStart(2, "0");

  return `${day}, ${date} ${month} ${year} ${hours}:${minutes}:${seconds} +0000`;
}

/**
 * Format a Unix timestamp (ms) as an ISO 8601 date string (UTC).
 * Used for Atom `<published>` and `<updated>` elements.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns ISO 8601 formatted date (e.g., "2026-02-08T14:30:00Z")
 */
export function toIso8601(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

// ─── RSS 2.0 Builders ───────────────────────────────────────────────────────

/**
 * Build a single RSS 2.0 `<item>` element.
 *
 * @param item - Feed item data
 * @returns XML string for the `<item>` element
 */
export function buildRssItem(item: RssFeedItem): string {
  const categoryTags = item.categories
    .map((cat) => `      <category><![CDATA[${escapeCdata(cat)}]]></category>`)
    .join("\n");

  const enclosureTag = item.enclosure
    ? `      <enclosure url="${escapeXml(item.enclosure.url)}" length="${item.enclosure.length}" type="${escapeXml(item.enclosure.type)}" />`
    : "";

  const commentsTag = item.commentCount > 0
    ? `      <comments>${escapeXml(item.commentsUrl)}</comments>\n      <slash:comments>${item.commentCount}</slash:comments>`
    : "";

  return `    <item>
      <title><![CDATA[${escapeCdata(item.title)}]]></title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.guid)}</guid>
      <pubDate>${toRfc2822(item.pubDate)}</pubDate>
      <dc:creator><![CDATA[${escapeCdata(item.creator)}]]></dc:creator>
${categoryTags ? categoryTags + "\n" : ""}      <description><![CDATA[${escapeCdata(item.description)}]]></description>
      <content:encoded><![CDATA[${escapeCdata(item.contentEncoded)}]]></content:encoded>
${commentsTag ? commentsTag + "\n" : ""}${enclosureTag ? enclosureTag + "\n" : ""}    </item>`;
}

/**
 * Build a single RSS 2.0 comment `<item>` element.
 *
 * @param item - Comment feed item data
 * @returns XML string for the `<item>` element
 */
export function buildRssCommentItem(item: CommentRssItem): string {
  return `    <item>
      <title><![CDATA[${escapeCdata(item.title)}]]></title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <pubDate>${toRfc2822(item.pubDate)}</pubDate>
      <dc:creator><![CDATA[${escapeCdata(item.creator)}]]></dc:creator>
      <description><![CDATA[${escapeCdata(item.description)}]]></description>
    </item>`;
}

/**
 * Build a complete RSS 2.0 XML document.
 *
 * Includes XML namespaces for:
 *   - content:encoded (full HTML content)
 *   - dc:creator (Dublin Core author)
 *   - atom:link (self-referencing feed link)
 *   - sy:updatePeriod/Frequency (syndication hints)
 *   - slash:comments (comment counts)
 *
 * @param config - Channel configuration and items
 * @returns Complete RSS 2.0 XML string
 */
export function buildRssChannel(config: RssChannelConfig): string {
  const items = config.items.map(buildRssItem).join("\n");

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
    <title><![CDATA[${escapeCdata(config.title)}]]></title>
    <link>${escapeXml(config.link)}</link>
    <description><![CDATA[${escapeCdata(config.description)}]]></description>
    <language>${escapeXml(config.language)}</language>
    <lastBuildDate>${toRfc2822(config.lastBuildDate)}</lastBuildDate>
    <atom:link href="${escapeXml(config.feedUrl)}" rel="self" type="application/rss+xml" />
    <sy:updatePeriod>hourly</sy:updatePeriod>
    <sy:updateFrequency>1</sy:updateFrequency>
    <generator>ConvexPress</generator>
${items}
  </channel>
</rss>`;
}

/**
 * Build a complete RSS 2.0 XML document for comment feeds.
 *
 * @param config - Channel configuration (uses CommentRssItem items)
 * @param commentItems - Comment feed items
 * @returns Complete RSS 2.0 XML string
 */
export function buildRssCommentChannel(
  config: Omit<RssChannelConfig, "items">,
  commentItems: CommentRssItem[],
): string {
  const items = commentItems.map(buildRssCommentItem).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:sy="http://purl.org/rss/1.0/modules/syndication/"
>
  <channel>
    <title><![CDATA[${escapeCdata(config.title)}]]></title>
    <link>${escapeXml(config.link)}</link>
    <description><![CDATA[${escapeCdata(config.description)}]]></description>
    <language>${escapeXml(config.language)}</language>
    <lastBuildDate>${toRfc2822(config.lastBuildDate)}</lastBuildDate>
    <atom:link href="${escapeXml(config.feedUrl)}" rel="self" type="application/rss+xml" />
    <sy:updatePeriod>hourly</sy:updatePeriod>
    <sy:updateFrequency>1</sy:updateFrequency>
    <generator>ConvexPress</generator>
${items}
  </channel>
</rss>`;
}

// ─── Atom 1.0 Builders ──────────────────────────────────────────────────────

/**
 * Build a single Atom 1.0 `<entry>` element.
 *
 * @param entry - Feed entry data
 * @returns XML string for the `<entry>` element
 */
export function buildAtomEntry(entry: AtomFeedEntry): string {
  const categoryTags = entry.categories
    .map(
      (cat) =>
        `      <category term="${escapeXml(cat.term)}" label="${escapeXml(cat.label)}" />`,
    )
    .join("\n");

  const enclosureTag = entry.enclosure
    ? `      <link rel="enclosure" href="${escapeXml(entry.enclosure.href)}" type="${escapeXml(entry.enclosure.type)}" length="${entry.enclosure.length}" />`
    : "";

  return `    <entry>
      <title type="html"><![CDATA[${escapeCdata(entry.title)}]]></title>
      <link href="${escapeXml(entry.link)}" rel="alternate" type="text/html" />
      <id>${escapeXml(entry.id)}</id>
      <published>${toIso8601(entry.published)}</published>
      <updated>${toIso8601(entry.updated)}</updated>
      <author>
        <name>${escapeXml(entry.author.name)}</name>
      </author>
${categoryTags ? categoryTags + "\n" : ""}      <summary type="html"><![CDATA[${escapeCdata(entry.summary)}]]></summary>
      <content type="html"><![CDATA[${escapeCdata(entry.content)}]]></content>
${enclosureTag ? enclosureTag + "\n" : ""}    </entry>`;
}

/**
 * Build a single Atom 1.0 comment `<entry>` element.
 *
 * @param entry - Comment entry data
 * @returns XML string for the `<entry>` element
 */
export function buildAtomCommentEntry(entry: CommentAtomEntry): string {
  return `    <entry>
      <title type="text">${escapeXml(entry.title)}</title>
      <link href="${escapeXml(entry.link)}" rel="alternate" type="text/html" />
      <id>${escapeXml(entry.id)}</id>
      <published>${toIso8601(entry.published)}</published>
      <updated>${toIso8601(entry.updated)}</updated>
      <author>
        <name>${escapeXml(entry.author.name)}</name>
      </author>
      <content type="html"><![CDATA[${escapeCdata(entry.content)}]]></content>
    </entry>`;
}

/**
 * Build a complete Atom 1.0 XML document.
 *
 * @param config - Feed configuration and entries
 * @returns Complete Atom 1.0 XML string
 */
export function buildAtomFeed(config: AtomFeedConfig): string {
  const entries = config.entries.map(buildAtomEntry).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${escapeXml(config.language)}">
    <title type="text">${escapeXml(config.title)}</title>
    <subtitle type="text">${escapeXml(config.subtitle)}</subtitle>
    <link href="${escapeXml(config.link)}" rel="alternate" type="text/html" />
    <link href="${escapeXml(config.feedUrl)}" rel="self" type="application/atom+xml" />
    <id>${escapeXml(config.id)}</id>
    <updated>${toIso8601(config.updated)}</updated>
    <generator uri="https://convexpress.dev" version="1.0">ConvexPress</generator>
${entries}
</feed>`;
}

/**
 * Build a complete Atom 1.0 XML document for comment feeds.
 *
 * @param config - Feed configuration (without entries)
 * @param commentEntries - Comment feed entries
 * @returns Complete Atom 1.0 XML string
 */
export function buildAtomCommentFeed(
  config: Omit<AtomFeedConfig, "entries">,
  commentEntries: CommentAtomEntry[],
): string {
  const entries = commentEntries.map(buildAtomCommentEntry).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${escapeXml(config.language)}">
    <title type="text">${escapeXml(config.title)}</title>
    <subtitle type="text">${escapeXml(config.subtitle)}</subtitle>
    <link href="${escapeXml(config.link)}" rel="alternate" type="text/html" />
    <link href="${escapeXml(config.feedUrl)}" rel="self" type="application/atom+xml" />
    <id>${escapeXml(config.id)}</id>
    <updated>${toIso8601(config.updated)}</updated>
    <generator uri="https://convexpress.dev" version="1.0">ConvexPress</generator>
${entries}
</feed>`;
}

// ─── ETag Generation ────────────────────────────────────────────────────────

/**
 * Generate a simple ETag string from the last updated timestamp and item count.
 * Avoids expensive hashing of the full XML body.
 *
 * @param lastUpdatedAt - Timestamp of the most recently updated item (ms)
 * @param itemCount - Number of items in the feed
 * @returns ETag string (e.g., '"1707401400000-10"')
 */
export function generateETag(lastUpdatedAt: number, itemCount: number): string {
  return `"${lastUpdatedAt}-${itemCount}"`;
}
