/**
 * RSS/Feed System - Public Actions
 *
 * Actions are used for operations that require external API calls.
 * Unlike mutations, actions can make HTTP requests but cannot directly
 * read/write the database -- they use ctx.runQuery/ctx.runMutation.
 *
 * Functions:
 *   fetchExternal - Fetch and parse an external RSS/Atom feed (admin only)
 *
 * WordPress equivalent: fetch_feed() using SimplePie library
 *
 * The fetchExternal action is the only authenticated operation in the
 * RSS/Feed System. All other feed operations (generating XML) are
 * handled by public queries that the website frontend transforms.
 */

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import {
  fetchExternalArgs,
  DEFAULT_EXTERNAL_MAX_ITEMS,
  MAX_EXTERNAL_MAX_ITEMS,
} from "./validators";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParsedFeed {
  feed: {
    title: string;
    description: string;
    link: string;
    lastUpdated: number;
    format: "rss2" | "atom";
  };
  items: Array<{
    title: string;
    link: string;
    description: string;
    content: string;
    publishedAt: number;
    author: string;
    categories: string[];
    guid: string;
  }>;
}

// ─── XML Parsing Helpers ────────────────────────────────────────────────────

/**
 * Extract the text content of the first matching XML element.
 * Simple regex-based extraction -- sufficient for feed parsing.
 */
function getElementText(xml: string, tagName: string): string {
  // Handle CDATA sections
  const cdataRegex = new RegExp(
    `<${tagName}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tagName}>`,
    "i",
  );
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  // Handle regular text content
  const textRegex = new RegExp(
    `<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`,
    "i",
  );
  const textMatch = xml.match(textRegex);
  if (textMatch) return textMatch[1].trim();

  return "";
}

/**
 * Extract an attribute value from an XML element.
 */
function getElementAttr(xml: string, tagName: string, attrName: string): string {
  const regex = new RegExp(
    `<${tagName}[^>]*\\s${attrName}=["']([^"']*)["'][^>]*/?>`,
    "i",
  );
  const match = xml.match(regex);
  return match ? match[1] : "";
}

/**
 * Extract all matching elements from XML as an array of strings.
 */
function getAllElements(xml: string, tagName: string): string[] {
  const regex = new RegExp(
    `<${tagName}[\\s>][\\s\\S]*?</${tagName}>`,
    "gi",
  );
  return xml.match(regex) || [];
}

/**
 * Unescape basic XML entities.
 */
function unescapeXml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Parse a date string (various formats) into a Unix timestamp (ms).
 */
function parseDate(dateStr: string): number {
  if (!dateStr) return Date.now();
  const parsed = Date.parse(dateStr);
  return isNaN(parsed) ? Date.now() : parsed;
}

// ─── RSS 2.0 Parser ────────────────────────────────────────────────────────

function parseRss2(xml: string, maxItems: number): ParsedFeed {
  const channelMatch = xml.match(/<channel>([\s\S]*?)<\/channel>/i);
  const channelXml = channelMatch ? channelMatch[1] : xml;

  const feed = {
    title: unescapeXml(getElementText(channelXml, "title")),
    description: unescapeXml(getElementText(channelXml, "description")),
    link: unescapeXml(getElementText(channelXml, "link")),
    lastUpdated: parseDate(
      getElementText(channelXml, "lastBuildDate") ||
        getElementText(channelXml, "pubDate"),
    ),
    format: "rss2" as const,
  };

  const itemElements = getAllElements(channelXml, "item");
  const items = itemElements.slice(0, maxItems).map((itemXml) => {
    // Extract categories
    const categoryMatches = itemXml.match(/<category[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/gi) || [];
    const categories = categoryMatches.map((cat) => {
      const innerMatch = cat.match(/>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?</);
      return innerMatch ? unescapeXml(innerMatch[1].trim()) : "";
    }).filter(Boolean);

    return {
      title: unescapeXml(getElementText(itemXml, "title")),
      link: unescapeXml(getElementText(itemXml, "link")),
      description: unescapeXml(
        getElementText(itemXml, "description"),
      ),
      content: unescapeXml(
        getElementText(itemXml, "content:encoded") ||
          getElementText(itemXml, "content"),
      ),
      publishedAt: parseDate(getElementText(itemXml, "pubDate")),
      author: unescapeXml(
        getElementText(itemXml, "dc:creator") ||
          getElementText(itemXml, "author"),
      ),
      categories,
      guid: unescapeXml(
        getElementText(itemXml, "guid") ||
          getElementText(itemXml, "link"),
      ),
    };
  });

  return { feed, items };
}

// ─── Atom 1.0 Parser ───────────────────────────────────────────────────────

function parseAtom(xml: string, maxItems: number): ParsedFeed {
  const feed = {
    title: unescapeXml(getElementText(xml, "title")),
    description: unescapeXml(
      getElementText(xml, "subtitle") || getElementText(xml, "tagline"),
    ),
    link: unescapeXml(
      getElementAttr(xml, "link", "href") || getElementText(xml, "link"),
    ),
    lastUpdated: parseDate(getElementText(xml, "updated")),
    format: "atom" as const,
  };

  const entryElements = getAllElements(xml, "entry");
  const items = entryElements.slice(0, maxItems).map((entryXml) => {
    // Extract categories
    const categoryMatches =
      entryXml.match(/<category[^>]*term=["']([^"']*)["'][^>]*\/?>/gi) || [];
    const categories = categoryMatches.map((cat) => {
      const termMatch = cat.match(/term=["']([^"']*)["']/);
      return termMatch ? unescapeXml(termMatch[1]) : "";
    }).filter(Boolean);

    // Get link href
    const linkHref = getElementAttr(entryXml, "link", "href") ||
      getElementText(entryXml, "link");

    return {
      title: unescapeXml(getElementText(entryXml, "title")),
      link: unescapeXml(linkHref),
      description: unescapeXml(getElementText(entryXml, "summary")),
      content: unescapeXml(getElementText(entryXml, "content")),
      publishedAt: parseDate(
        getElementText(entryXml, "published") ||
          getElementText(entryXml, "updated"),
      ),
      author: unescapeXml(
        getElementText(
          getElementText(entryXml, "author") || "",
          "name",
        ) || getElementText(entryXml, "author"),
      ),
      categories,
      guid: unescapeXml(
        getElementText(entryXml, "id") || linkHref,
      ),
    };
  });

  return { feed, items };
}

// ─── fetchExternal ──────────────────────────────────────────────────────────

/**
 * Fetch and parse an external RSS/Atom feed.
 *
 * Auth: Required - Administrator only (role level 100).
 *
 * Flow:
 *   1. Authenticate the caller and verify Administrator role
 *   2. Validate the URL format
 *   3. Fetch the URL using fetch()
 *   4. Detect feed format (RSS 2.0 or Atom 1.0) from root element
 *   5. Parse feed metadata and items/entries
 *   6. Return structured data
 *
 * @returns { feed: {...}, items: [...] } with parsed feed data
 * @throws ConvexError "UNAUTHORIZED" if not authenticated
 * @throws ConvexError "FORBIDDEN" if not Administrator
 * @throws ConvexError "VALIDATION_ERROR" if URL is invalid
 * @throws ConvexError "FETCH_ERROR" if network request fails
 * @throws ConvexError "PARSE_ERROR" if response is not valid feed XML
 */
export const fetchExternal = action({
  args: fetchExternalArgs,
  handler: async (ctx, args) => {
    // ── 1. Authentication ─────────────────────────────────────────────────
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // Look up the caller
    const caller = await ctx.runQuery(
      internal.feeds.internals.getUserByIdentifier,
      { userId: identity.subject },
    );
    if (!caller) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "User not found",
      });
    }

    // Verify Administrator role level
    const roleLevel = await ctx.runQuery(
      internal.feeds.internals.getUserRoleLevel,
      { userId: caller._id },
    );
    if (roleLevel < 100) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Administrator access required to fetch external feeds",
      });
    }

    // ── 2. Validate URL ───────────────────────────────────────────────────
    let feedUrl: URL;
    try {
      feedUrl = new URL(args.url);
    } catch {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Invalid URL format. Must be a valid HTTP or HTTPS URL.",
      });
    }

    if (!["http:", "https:"].includes(feedUrl.protocol)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "URL must use HTTP or HTTPS protocol.",
      });
    }

    const maxItems = Math.min(
      Math.max(1, args.maxItems ?? DEFAULT_EXTERNAL_MAX_ITEMS),
      MAX_EXTERNAL_MAX_ITEMS,
    );

    // ── 3. Fetch the feed ─────────────────────────────────────────────────
    let responseText: string;
    try {
      const response = await fetch(args.url, {
        headers: {
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
          "User-Agent": "ConvexPress Feed Fetcher/1.0",
        },
      });

      if (!response.ok) {
        throw new ConvexError({
          code: "FETCH_ERROR",
          message: `Feed URL returned HTTP ${response.status}: ${response.statusText}`,
        });
      }

      responseText = await response.text();
    } catch (error: unknown) {
      if (error instanceof ConvexError) throw error;

      throw new ConvexError({
        code: "FETCH_ERROR",
        message: `Network error fetching feed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }

    // ── 4. Detect format and parse ────────────────────────────────────────
    const trimmedXml = responseText.trim();

    if (!trimmedXml.includes("<")) {
      throw new ConvexError({
        code: "PARSE_ERROR",
        message: "Response is not valid XML. Expected RSS or Atom feed.",
      });
    }

    try {
      // Detect Atom feeds by the <feed> root element with Atom namespace
      if (
        trimmedXml.includes("<feed") &&
        trimmedXml.includes("http://www.w3.org/2005/Atom")
      ) {
        return parseAtom(trimmedXml, maxItems);
      }

      // Detect RSS feeds by the <rss> root element or <channel> element
      if (trimmedXml.includes("<rss") || trimmedXml.includes("<channel")) {
        return parseRss2(trimmedXml, maxItems);
      }

      // Try Atom without namespace check (some feeds omit the namespace)
      if (trimmedXml.includes("<feed") && trimmedXml.includes("<entry")) {
        return parseAtom(trimmedXml, maxItems);
      }

      throw new ConvexError({
        code: "PARSE_ERROR",
        message:
          "Response is XML but not a recognized feed format. Expected RSS 2.0 or Atom 1.0.",
      });
    } catch (error: unknown) {
      if (error instanceof ConvexError) throw error;

      throw new ConvexError({
        code: "PARSE_ERROR",
        message: `Failed to parse feed XML: ${error instanceof Error ? error.message : "Unknown parse error"}`,
      });
    }
  },
});
