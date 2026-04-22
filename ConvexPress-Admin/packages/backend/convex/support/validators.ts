/**
 * Support Bridge System - Shared Argument Validators
 *
 * Reusable Convex argument validators for support mutations, queries, and actions.
 * Centralizes validation logic so function files stay clean.
 */

import { v } from "convex/values";
import { deflectionOutcomeValidator } from "../schema/support";

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { deflectionOutcomeValidator };

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of KB articles returned per deflection response. */
export const MAX_DEFLECTION_ARTICLES = 5;

/** Deflection log retention in milliseconds (90 days). */
export const DEFLECTION_LOG_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** Maximum query length for deflection. */
export const MAX_DEFLECTION_QUERY_LENGTH = 1000;

// ─── Deflection Args ──────────────────────────────────────────────────────────

export const generateAnswerArgs = {
  query: v.string(),
  sessionId: v.string(),
};

export const logInteractionArgs = {
  sessionId: v.string(),
  query: v.string(),
  aiResponse: v.string(),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  kbArticleIds: v.array(v.string()),
  outcome: deflectionOutcomeValidator,
  ticketId: v.optional(v.string()),
  responseLatencyMs: v.number(),
  tokensUsed: v.optional(v.number()),
};

// ─── Widget Args ──────────────────────────────────────────────────────────────

export const getConfigArgs = {};

export const getRecentTicketsArgs = {
  limit: v.optional(v.number()),
};

// ─── Analytics Args ───────────────────────────────────────────────────────────

export const getDeflectionStatsArgs = {
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
};

export const getTopDeflectingArticlesArgs = {
  limit: v.optional(v.number()),
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
};

export const getCommonUnansweredArgs = {
  limit: v.optional(v.number()),
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
};

// ─── Internal Args ────────────────────────────────────────────────────────────

export const logDeflectionInternalArgs = {
  sessionId: v.string(),
  userId: v.optional(v.id("users")),
  query: v.string(),
  aiResponse: v.string(),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  kbArticleIds: v.array(v.string()),
  outcome: deflectionOutcomeValidator,
  ticketId: v.optional(v.string()),
  responseLatencyMs: v.number(),
  tokensUsed: v.optional(v.number()),
};
