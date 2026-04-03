/**
 * Server-side HTML/JSON Sanitization for TipTap Content
 *
 * Provides sanitization for TipTap JSON content stored in Convex.
 * Since TipTap content is stored as JSON (not raw HTML), we sanitize
 * at the JSON structure level rather than parsing HTML strings.
 *
 * Sanitization targets:
 *   - Dangerous node types (script, etc.)
 *   - Event handler attributes (onclick, onerror, etc.)
 *   - Dangerous URL protocols (javascript:, data:, vbscript:)
 *   - Excessively deep nesting (DoS protection)
 */

// ── Safe URL Protocol Validation ──────────────────────────────────────────────

const SAFE_URL_PROTOCOLS = ["http:", "https:", "mailto:", "tel:", "/"];
const DANGEROUS_PROTOCOL_PATTERN = /^(javascript|data|vbscript|blob):/i;

/**
 * Validate a URL is safe to render in an href or src attribute.
 * Blocks javascript:, data:, vbscript:, and blob: protocols.
 * Returns the URL if safe, or an empty string if dangerous.
 */
export function sanitizeUrl(url: string | undefined | null): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  // Block dangerous protocols
  if (DANGEROUS_PROTOCOL_PATTERN.test(trimmed)) {
    return "";
  }

  // Allow relative URLs (start with / or #)
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) {
    return trimmed;
  }

  // Allow safe protocols
  try {
    const parsed = new URL(trimmed);
    if (SAFE_URL_PROTOCOLS.some((p) => parsed.protocol === p)) {
      return trimmed;
    }
    // Also allow protocol-relative URLs
    if (trimmed.startsWith("//")) {
      return trimmed;
    }
    return "";
  } catch {
    // Not a valid absolute URL — allow if it looks like a relative path
    if (/^[a-zA-Z0-9]/.test(trimmed) && !trimmed.includes(":")) {
      return trimmed;
    }
    return "";
  }
}

// ── Event Handler Attribute Detection ─────────────────────────────────────────

const EVENT_HANDLER_PATTERN = /^on[a-z]+$/i;

/**
 * Remove dangerous attributes from a TipTap node's attrs object.
 * Strips event handlers (onclick, onerror, etc.) and sanitizes URLs.
 */
function sanitizeAttrs(attrs: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!attrs) return attrs;

  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(attrs)) {
    // Strip event handler attributes
    if (EVENT_HANDLER_PATTERN.test(key)) {
      continue;
    }

    // Sanitize URL attributes
    if (
      (key === "href" || key === "src" || key === "url" || key === "embedUrl") &&
      typeof value === "string"
    ) {
      cleaned[key] = sanitizeUrl(value);
      continue;
    }

    cleaned[key] = value;
  }

  return cleaned;
}

// ── TipTap JSON Node Sanitization ─────────────────────────────────────────────

/** Node types that should never appear in stored content */
const BLOCKED_NODE_TYPES = new Set(["script", "style", "iframe", "object", "embed", "applet", "form"]);

/** Maximum nesting depth to prevent DoS */
const MAX_DEPTH = 50;

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: Array<{
    type: string;
    attrs?: Record<string, unknown>;
  }>;
}

/**
 * Sanitize a TipTap JSON document by removing dangerous nodes,
 * stripping event handler attributes, and validating URLs.
 *
 * @param jsonString - The TipTap content JSON string
 * @returns Sanitized JSON string
 */
export function sanitizeTipTapContent(jsonString: string | undefined | null): string {
  if (!jsonString) return jsonString ?? "";

  try {
    const doc = JSON.parse(jsonString) as TipTapNode;
    const sanitized = sanitizeNode(doc, 0);
    return JSON.stringify(sanitized);
  } catch {
    // If it's not valid JSON, return as-is (the caller should handle parse errors)
    return jsonString;
  }
}

function sanitizeNode(node: TipTapNode, depth: number): TipTapNode {
  if (depth > MAX_DEPTH) {
    return { type: "paragraph", content: [{ type: "text", text: "[Content too deeply nested]" }] };
  }

  // Strip blocked node types entirely
  if (BLOCKED_NODE_TYPES.has(node.type)) {
    return { type: "paragraph", content: [{ type: "text", text: "" }] };
  }

  const result: TipTapNode = { type: node.type };

  // Sanitize attributes
  if (node.attrs) {
    result.attrs = sanitizeAttrs(node.attrs) as Record<string, unknown>;
  }

  // Preserve text content
  if (node.text !== undefined) {
    result.text = node.text;
  }

  // Sanitize marks (inline formatting)
  if (node.marks) {
    result.marks = node.marks
      .filter((mark) => !BLOCKED_NODE_TYPES.has(mark.type))
      .map((mark) => ({
        type: mark.type,
        attrs: sanitizeAttrs(mark.attrs) as Record<string, unknown>,
      }));
  }

  // Recursively sanitize children, filtering out blocked nodes
  if (node.content) {
    result.content = node.content
      .filter((child) => !BLOCKED_NODE_TYPES.has(child.type))
      .map((child) => sanitizeNode(child, depth + 1));
  }

  return result;
}
