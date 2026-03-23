/**
 * HTTP API Helpers
 *
 * Shared utilities for all /api/v1/ HTTP action handlers.
 * Provides standard response formatting, CORS headers, pagination,
 * error handling, and authentication wrappers.
 */

import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

// ─── CORS Headers ──────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-SmithHarper-Event",
  "Access-Control-Max-Age": "86400",
};

/**
 * Create a CORS preflight response for OPTIONS requests.
 */
export function corsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

// ─── JSON Response Helpers ──────────────────────────────────────────────────

/**
 * Create a standard JSON response with CORS headers.
 */
export function jsonResponse(
  data: unknown,
  status: number = 200,
  extraHeaders?: Record<string, string>,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
    ...extraHeaders,
  };

  return new Response(JSON.stringify(data), { status, headers });
}

/**
 * Create an error response following the standard format.
 */
export function errorResponse(
  error: string,
  code: string,
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return jsonResponse({ error, code, status, ...extra }, status);
}

/**
 * Create a paginated collection response with standard pagination headers.
 */
export function paginatedResponse(
  data: unknown[],
  total: number,
  page: number,
  perPage: number,
): Response {
  const totalPages = Math.ceil(total / perPage);
  return jsonResponse(data, 200, {
    "X-Total": String(total),
    "X-Total-Pages": String(totalPages),
    "X-Page": String(page),
    "X-Per-Page": String(perPage),
  });
}

// ─── Authentication Wrapper ─────────────────────────────────────────────────

interface AuthResult {
  authenticated: true;
  keyId: string;
  userId: string;
  scopes: string[];
  keyPrefix: string;
}

interface AuthFailure {
  authenticated: false;
  error: string;
  errorCode: string;
  retryAfter?: number;
}

/**
 * Authenticate an incoming API request.
 * Returns the auth result or sends an error response.
 */
export async function authenticateApiRequest(
  ctx: ActionCtx,
  request: Request,
  requiredScope: string,
): Promise<AuthResult | Response> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse(
      "Missing Authorization header. Use 'Bearer <api_key>'",
      "UNAUTHORIZED",
      401,
    );
  }

  const clientIp =
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    request.headers.get("X-Real-IP") ||
    undefined;

  const result = (await ctx.runMutation(
    internal.api.internals.authenticateRequest,
    {
      authorizationHeader: authHeader,
      requiredScope,
      clientIp,
    },
  )) as AuthResult | AuthFailure;

  if (!result.authenticated) {
    const failure = result as AuthFailure;
    const statusMap: Record<string, number> = {
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      RATE_LIMITED: 429,
    };
    const status = statusMap[failure.errorCode] ?? 401;
    const extra: Record<string, unknown> = {};
    if (failure.retryAfter) {
      extra.retry_after = failure.retryAfter;
    }
    return errorResponse(failure.error, failure.errorCode, status, extra);
  }

  return result as AuthResult;
}

// ─── Request Parsing Helpers ────────────────────────────────────────────────

/**
 * Parse pagination parameters from URL search params.
 * Defaults: page=1, perPage=10, max perPage=100.
 */
export function parsePagination(url: URL): { page: number; perPage: number } {
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const perPage = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("per_page") ?? "10", 10)),
  );
  return { page, perPage };
}

/**
 * Extract a resource ID from a URL path.
 * Pattern: /api/v1/{resource}/{id}
 */
export function extractIdFromPath(
  url: URL,
  pathPrefix: string,
): string | null {
  const path = url.pathname;
  if (!path.startsWith(pathPrefix + "/")) return null;
  const id = path.substring(pathPrefix.length + 1);
  // Convex IDs don't contain slashes
  if (id.includes("/") || id.length === 0) return null;
  return id;
}

/**
 * Parse JSON body from request, returning null on failure.
 */
export async function parseJsonBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ─── Date formatting ────────────────────────────────────────────────────────

/**
 * Format a timestamp to ISO 8601 string.
 */
export function toISOString(timestamp: number): string {
  return new Date(timestamp).toISOString();
}
