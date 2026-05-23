/**
 * ConvexPress Analytics Tracker
 *
 * Lightweight client-side tracking script (~2KB minified + gzipped).
 * Fires events to the /api/analytics/track HTTP endpoint on the Convex backend.
 *
 * Tracks:
 *   - pageview: on page load
 *   - scroll_depth: when content sections enter the viewport (IntersectionObserver)
 *   - click: on internal link clicks (delegated handler)
 *   - exit: on page hide/unload (time on page via keepalive fetch)
 *
 * Privacy:
 *   - visitorId: anonymous UUID in localStorage (no cookie)
 *   - sessionId: random UUID in sessionStorage (dies on tab close)
 *   - Respects navigator.doNotTrack === "1"
 *   - User agent sent to server for parsing; raw UA string is never stored
 *   - No fingerprinting, no cross-site tracking, no PII
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrackingEvent {
  eventType: "pageview" | "scroll_depth" | "click" | "exit";
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

// ─── ID Generation ──────────────────────────────────────────────────────────

function generateId(): string {
  // Crypto.randomUUID is available in all modern browsers
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getVisitorId(): string {
  const key = "_cp_vid";
  let id = localStorage.getItem(key);
  if (!id) {
    id = generateId();
    localStorage.setItem(key, id);
  }
  return id;
}

function getSessionId(): string {
  const key = "_cp_sid";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = generateId();
    sessionStorage.setItem(key, id);
  }
  return id;
}

// ─── UTM Extraction ─────────────────────────────────────────────────────────

function getUtmParams(): {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
} {
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get("utm_source") ?? undefined,
    utmMedium: params.get("utm_medium") ?? undefined,
    utmCampaign: params.get("utm_campaign") ?? undefined,
  };
}

// ─── Event Queue ────────────────────────────────────────────────────────────

let eventQueue: TrackingEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let endpointUrl = "";
let endpointDisabled = false;

function queueEvent(event: TrackingEvent) {
  eventQueue.push(event);

  // Flush after 2 seconds or when queue reaches 10 events
  if (eventQueue.length >= 10) {
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flush, 2000);
  }
}

function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (eventQueue.length === 0 || !endpointUrl || endpointDisabled) return;

  const events = eventQueue.splice(0, 20); // Max 20 per request
  const payload = JSON.stringify({ events });

  fetchSend(payload);
}

function fetchSend(payload: string) {
  fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).then((response) => {
    if (response.status === 404 || response.status === 405) {
      endpointDisabled = true;
      eventQueue = [];
    }
  }).catch(() => {
    // Silently ignore network errors -- analytics should never break the site
  });
}

// ─── Scroll Depth Tracking ──────────────────────────────────────────────────

let deepestSectionIndex = -1;
let scrollObserver: IntersectionObserver | null = null;

function setupScrollTracking(visitorId: string, sessionId: string) {
  const sentinels = document.querySelectorAll("[data-analytics-section]");
  if (sentinels.length === 0) return;

  const sectionOrder = Array.from(sentinels).map((el) =>
    (el as HTMLElement).dataset.analyticsSection!,
  );

  scrollObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const section = (entry.target as HTMLElement).dataset.analyticsSection!;
        const index = sectionOrder.indexOf(section);

        if (index > deepestSectionIndex) {
          deepestSectionIndex = index;
          queueEvent({
            eventType: "scroll_depth",
            path: window.location.pathname,
            visitorId,
            sessionId,
            timestamp: Date.now(),
            payload: {
              section,
              sectionIndex: index,
              maxSections: sectionOrder.length,
            },
          });
        }
      }
    },
    { threshold: 0.5 },
  );

  sentinels.forEach((el) => scrollObserver!.observe(el));
}

// ─── Click Tracking ─────────────────────────────────────────────────────────

function setupClickTracking(visitorId: string, sessionId: string) {
  document.addEventListener("click", (e) => {
    const anchor = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    // Only track internal links (same origin or relative)
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;

      queueEvent({
        eventType: "click",
        path: window.location.pathname,
        visitorId,
        sessionId,
        timestamp: Date.now(),
        payload: {
          targetPath: url.pathname,
          targetLabel: (anchor.textContent ?? anchor.getAttribute("aria-label") ?? "").trim().slice(0, 100),
        },
      });
    } catch {
      // Invalid URL, skip
    }
  });
}

// ─── Time on Page Tracking ──────────────────────────────────────────────────

let pageLoadTime = 0;
let engagedTime = 0;
let lastVisibleTime = 0;
let isPageVisible = true;

function setupTimeTracking(visitorId: string, sessionId: string) {
  pageLoadTime = Date.now();
  lastVisibleTime = pageLoadTime;
  isPageVisible = true;

  // Track visibility changes to compute engaged time
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (isPageVisible) {
        engagedTime += Date.now() - lastVisibleTime;
        isPageVisible = false;
      }
      // Fire exit event when page becomes hidden
      sendExitEvent(visitorId, sessionId);
    } else {
      lastVisibleTime = Date.now();
      isPageVisible = true;
    }
  });

  // Also send on beforeunload as a fallback
  window.addEventListener("beforeunload", () => {
    sendExitEvent(visitorId, sessionId);
  });
}

function sendExitEvent(visitorId: string, sessionId: string) {
  const now = Date.now();
  const totalTime = now - pageLoadTime;
  const totalEngaged = engagedTime + (isPageVisible ? now - lastVisibleTime : 0);

  // Add exit event directly to queue and flush immediately
  eventQueue.push({
    eventType: "exit",
    path: window.location.pathname,
    visitorId,
    sessionId,
    timestamp: now,
    payload: {
      timeOnPageMs: totalTime,
      engagedTimeMs: totalEngaged,
    },
  });

  flush();
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize the analytics tracker.
 *
 * @param convexUrl - The Convex deployment URL (e.g., "https://xxx.convex.cloud")
 *                    The tracking endpoint will be `${convexUrl}/api/analytics/track`
 */
export function initAnalytics(convexUrl: string): void {
  // Respect Do Not Track
  if (navigator.doNotTrack === "1") return;

  // Set endpoint
  endpointUrl = convexUrl.replace(/\/$/, "") + "/api/analytics/track";
  endpointDisabled = false;

  // Get or create anonymous IDs
  const visitorId = getVisitorId();
  const sessionId = getSessionId();

  // Extract UTM params from URL
  const utm = getUtmParams();

  // Fire pageview event
  queueEvent({
    eventType: "pageview",
    path: window.location.pathname,
    visitorId,
    sessionId,
    timestamp: Date.now(),
    referrer: document.referrer || undefined,
    userAgent: navigator.userAgent,
    ...utm,
  });

  // Setup tracking
  setupScrollTracking(visitorId, sessionId);
  setupClickTracking(visitorId, sessionId);
  setupTimeTracking(visitorId, sessionId);
}

/**
 * Track a client-side navigation (for SPAs using TanStack Router).
 * Call this on route change to fire a new pageview event.
 */
export function trackPageview(): void {
  if (navigator.doNotTrack === "1") return;
  if (!endpointUrl) return;

  const visitorId = getVisitorId();
  const sessionId = getSessionId();

  // Reset scroll tracking for new page
  deepestSectionIndex = -1;
  if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }

  // Reset time tracking
  pageLoadTime = Date.now();
  engagedTime = 0;
  lastVisibleTime = Date.now();
  isPageVisible = true;

  // Fire pageview
  queueEvent({
    eventType: "pageview",
    path: window.location.pathname,
    visitorId,
    sessionId,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
  });

  // Re-setup scroll tracking for new page content (slight delay for DOM render)
  setTimeout(() => {
    setupScrollTracking(visitorId, sessionId);
  }, 100);
}

/**
 * Clean up the tracker (disconnect observers, clear timers).
 */
export function destroyAnalytics(): void {
  if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flush(); // Final flush
}
