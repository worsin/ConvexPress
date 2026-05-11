/**
 * Event Dispatcher System - Frontend TypeScript Types
 *
 * Type definitions for working with events, listeners, and executions
 * in the admin frontend. These types mirror the Convex schema but are
 * adapted for client-side usage (parsed payloads, resolved actor names).
 */

import type { Id } from "@backend/convex/_generated/dataModel";

// ─── Event Status ─────────────────────────────────────────────────────────

/** Processing status of an event */
export type EventStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "partial";

/** Execution status of a single listener invocation */
export type ExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "retrying"
  | "skipped";

/** Handler invocation type */
export type HandlerType = "internal" | "action" | "scheduled";

/** Retry backoff strategy */
export type RetryBackoff = "linear" | "exponential";

// ─── Event Types ──────────────────────────────────────────────────────────

/** Raw event record from the database */
export interface EventRecord {
  _id: Id<"events">;
  _creationTime: number;
  code: string;
  system: string;
  payload: string;
  actorId?: string;
  actorIp?: string;
  status: EventStatus;
  listenersTotal: number;
  listenersCompleted: number;
  listenersFailed: number;
  listenersSkipped?: number;
  correlationId?: string;
  parentEventId?: Id<"events">;
  emittedAt: number;
  processedAt?: number;
  expiresAt?: number;
}

/**
 * Event with enriched execution details (from events.get query).
 * Note: actorId is a raw auth identity ID. Actor name resolution should be
 * done on the frontend via a separate user lookup if needed.
 */
export interface EventWithDetails extends EventRecord {
  executions?: EnrichedExecutionRecord[];
}

/** Execution record enriched with listener details (from events.get query) */
export interface EnrichedExecutionRecord extends ExecutionRecord {
  listenerName: string;
  listenerEventCode: string;
  listenerSystem: string;
}

/** Paginated event list response from events.list query */
export interface EventListResponse {
  events: EventRecord[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ─── Listener Types ───────────────────────────────────────────────────────

/** Event listener record from the database */
export interface ListenerRecord {
  _id: Id<"eventListeners">;
  _creationTime: number;
  eventCode: string;
  name: string;
  handlerModule: string;
  handlerFunction: string;
  handlerType: HandlerType;
  priority: number;
  isActive: boolean;
  maxRetries: number;
  retryDelayMs: number;
  retryBackoff: RetryBackoff;
  filterCondition?: string;
  system: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

/** Parsed listener with filter condition as object */
export interface ListenerWithParsedFilter extends Omit<ListenerRecord, "filterCondition"> {
  filterCondition?: Record<string, unknown>;
}

// ─── Execution Types ──────────────────────────────────────────────────────

/** Execution record from the database */
export interface ExecutionRecord {
  _id: Id<"eventListenerExecutions">;
  _creationTime: number;
  eventId: Id<"events">;
  listenerId: Id<"eventListeners">;
  status: ExecutionStatus;
  attempt: number;
  result?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  nextRetryAt?: number;
  scheduledFunctionId?: string;
}

/** Execution with resolved listener name (for display) */
export interface ExecutionWithListener extends ExecutionRecord {
  listenerName?: string;
  listenerHandlerModule?: string;
  listenerHandlerFunction?: string;
  listenerPriority?: number;
}

// ─── Filter/Query Types ───────────────────────────────────────────────────

/** Arguments for the events.list query */
export interface EventListFilters {
  code?: string;
  system?: string;
  status?: EventStatus;
  actorId?: string;
  correlationId?: string;
  page?: number;
  perPage?: number;
}

/** Arguments for the events.listListeners query */
export interface ListenerListFilters {
  eventCode?: string;
  system?: string;
  activeOnly?: boolean;
}

// ─── Utility Types ────────────────────────────────────────────────────────

/** Event code category (for grouping in admin UI) */
export type EventCategory =
  | "content"
  | "comment"
  | "media"
  | "taxonomy"
  | "auth"
  | "user"
  | "role"
  | "password"
  | "menu"
  | "settings"
  | "seo"
  | "api"
  | "notification"
  | "revision"
  | "system";

/** Map of event status to display properties */
export interface EventStatusDisplay {
  label: string;
  variant: "default" | "warning" | "success" | "error" | "info";
}

/** Map of all event statuses to their display properties */
export const EVENT_STATUS_DISPLAY: Record<EventStatus, EventStatusDisplay> = {
  pending: { label: "Pending", variant: "default" },
  processing: { label: "Processing", variant: "info" },
  completed: { label: "Completed", variant: "success" },
  failed: { label: "Failed", variant: "error" },
  partial: { label: "Partial", variant: "warning" },
};

/** Map of execution statuses to their display properties */
export const EXECUTION_STATUS_DISPLAY: Record<ExecutionStatus, EventStatusDisplay> = {
  pending: { label: "Pending", variant: "default" },
  running: { label: "Running", variant: "info" },
  completed: { label: "Completed", variant: "success" },
  failed: { label: "Failed", variant: "error" },
  retrying: { label: "Retrying", variant: "warning" },
  skipped: { label: "Skipped", variant: "default" },
};
