/**
 * Analytics System - HTTP Action
 *
 * Public endpoint that receives batched tracking events from the website
 * tracking script. No authentication required -- this is a public ingestion
 * endpoint. Rate limiting is enforced per-request (max 20 events).
 *
 * Processing flow:
 *   1. Parse JSON body, validate events array (max 20)
 *   2. For each event: parse userAgent, extract referrerDomain, resolve postId
 *   3. Call ingestEvents internal mutation with normalized events
 *   4. Return accepted count
 *
 * Privacy: userAgent is parsed into deviceType/browser/os and discarded.
 * IP is not stored (could be used for geo lookup in the future).
 */

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { corsPreflightResponse, jsonResponse, errorResponse } from "./helpers";

// ─── User Agent Parsing (lightweight, no external dependency) ───────────────

interface ParsedUA {
  deviceType: "desktop" | "mobile" | "tablet";
  browser: string;
  os: string;
}

function parseUserAgent(ua: string | undefined): ParsedUA {
  if (!ua) {
    return { deviceType: "desktop", browser: "Unknown", os: "Unknown" };
  }

  // Device type detection
  let deviceType: "desktop" | "mobile" | "tablet" = "desktop";
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = "tablet";
  } else if (
    /mobile|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)
  ) {
    deviceType = "mobile";
  }

  // Browser detection (order matters -- more specific first)
  let browser = "Other";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = "Opera";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = "Safari";
  else if (/chrome\//i.test(ua)) browser = "Chrome";

  // OS detection
  let os = "Other";
  if (/windows nt/i.test(ua)) os = "Windows";
  else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/linux/i.test(ua)) os = "Linux";
  else if (/cros/i.test(ua)) os = "ChromeOS";

  return { deviceType, browser, os };
}

// ─── Referrer Domain Extraction ─────────────────────────────────────────────

function extractReferrerDomain(referrer: string | undefined): string | undefined {
  if (!referrer) return undefined;
  try {
    const url = new URL(referrer);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

// ─── Path Sanitization ──────────────────────────────────────────────────────

function sanitizePath(path: string): string {
  // Remove query string and fragment
  let clean = path.split("?")[0].split("#")[0];
  // Ensure leading slash
  if (!clean.startsWith("/")) clean = "/" + clean;
  // Remove trailing slash (except root)
  if (clean.length > 1 && clean.endsWith("/")) {
    clean = clean.slice(0, -1);
  }
  // Limit length
  if (clean.length > 500) clean = clean.slice(0, 500);
  return clean;
}

// ─── Event Validation ───────────────────────────────────────────────────────

const VALID_EVENT_TYPES = new Set(["pageview", "scroll_depth", "click", "exit"]);
const MAX_EVENTS_PER_REQUEST = 20;

interface RawTrackingEvent {
  eventType: string;
  path: string;
  visitorId: string;
  sessionId: string;
  timestamp: number;
  referrer?: string;
  userAgent?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  payload?: {
    section?: string;
    sectionIndex?: number;
    maxSections?: number;
    targetPath?: string;
    targetLabel?: string;
    timeOnPageMs?: number;
    engagedTimeMs?: number;
  };
}

function validateEvent(event: unknown): event is RawTrackingEvent {
  if (typeof event !== "object" || event === null) return false;
  const e = event as Record<string, unknown>;

  if (!VALID_EVENT_TYPES.has(e.eventType as string)) return false;
  if (typeof e.path !== "string" || e.path.length === 0) return false;
  if (typeof e.visitorId !== "string" || e.visitorId.length === 0) return false;
  if (typeof e.sessionId !== "string" || e.sessionId.length === 0) return false;
  if (typeof e.timestamp !== "number" || e.timestamp <= 0) return false;

  return true;
}

// ─── HTTP Action ────────────────────────────────────────────────────────────

export const analyticsTrackHandler = httpAction(async (ctx, request) => {
  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", "INVALID_BODY", 400);
  }

  // Validate top-level structure
  if (typeof body !== "object" || body === null || !Array.isArray((body as any).events)) {
    return errorResponse(
      'Request body must have an "events" array',
      "INVALID_STRUCTURE",
      400,
    );
  }

  const rawEvents = (body as { events: unknown[] }).events;

  // Enforce max events per request
  if (rawEvents.length > MAX_EVENTS_PER_REQUEST) {
    return errorResponse(
      `Maximum ${MAX_EVENTS_PER_REQUEST} events per request`,
      "TOO_MANY_EVENTS",
      400,
    );
  }

  if (rawEvents.length === 0) {
    return jsonResponse({ accepted: 0 });
  }

  // Validate and normalize each event
  const normalizedEvents: Array<Record<string, unknown>> = [];

  for (const raw of rawEvents) {
    if (!validateEvent(raw)) continue; // Silently skip invalid events

    const { deviceType, browser, os } = parseUserAgent(raw.userAgent);
    const referrerDomain = extractReferrerDomain(raw.referrer);
    const cleanPath = sanitizePath(raw.path);

    // Resolve postId from path (look up published posts by slug)
    let postId: string | undefined;
    const slug = cleanPath.startsWith("/blog/")
      ? cleanPath.slice(6)
      : cleanPath.startsWith("/")
        ? cleanPath.slice(1)
        : cleanPath;

    if (slug) {
      const post = await ctx.runQuery(internal.analytics.internals.resolvePostFromPath, {
        path: cleanPath,
      });
      if (post) {
        postId = post;
      }
    }

    normalizedEvents.push({
      eventType: raw.eventType,
      timestamp: raw.timestamp,
      path: cleanPath,
      postId,
      visitorId: raw.visitorId,
      sessionId: raw.sessionId,
      referrer: raw.referrer,
      referrerDomain,
      utmSource: raw.utmSource,
      utmMedium: raw.utmMedium,
      utmCampaign: raw.utmCampaign,
      deviceType,
      browser,
      os,
      country: undefined, // Geo resolution deferred for v1
      region: undefined,
      payload: raw.payload,
    });
  }

  // Write normalized events to the database
  if (normalizedEvents.length > 0) {
    await ctx.runMutation(internal.analytics.internals.ingestEvents, {
      events: normalizedEvents,
    });
  }

  return jsonResponse({ accepted: normalizedEvents.length });
});
