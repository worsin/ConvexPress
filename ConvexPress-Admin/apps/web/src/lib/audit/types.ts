/**
 * Audit Log System - TypeScript Types
 *
 * Frontend type definitions for audit log data structures.
 * These mirror the Convex query return types for type safety.
 */

// ─── Severity & Object Type Enums ───────────────────────────────────────────

export type AuditSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "informational";

export type AuditObjectType =
  | "post"
  | "page"
  | "comment"
  | "media"
  | "user"
  | "role"
  | "taxonomy"
  | "menu"
  | "settings"
  | "seo"
  | "api"
  | "notification"
  | "system";

// ─── List Entry (from auditLogs.queries.list) ──────────────────────────────

export interface AuditEntryListItem {
  _id: string;
  eventId: string;
  eventCode: string;
  action: string;
  description: string;
  severity: AuditSeverity;
  system: string;
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
  actorRole?: string;
  actorIp?: string;
  objectType: AuditObjectType;
  objectId?: string;
  objectLabel?: string;
  correlationId?: string;
  occurredAt: number;
}

// ─── Detail Entry (from auditLogs.queries.get) ─────────────────────────────

export interface AuditEntryDetail {
  _id: string;
  eventId: string;
  eventCode: string;
  action: string;
  description: string;
  severity: AuditSeverity;
  system: string;
  objectType: AuditObjectType;
  objectId?: string;
  objectLabel?: string;
  occurredAt: number;
  actor: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
    ip?: string;
    userAgent?: string;
  };
  changes?: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  rawPayload: Record<string, unknown>;
  event: {
    status: string;
    listenersTotal: number;
    listenersCompleted: number;
    listenersFailed: number;
    processedAt?: number;
  } | null;
  relatedEntries?: Array<{
    _id: string;
    eventCode: string;
    description: string;
    occurredAt: number;
  }>;
}

// ─── Stats (from auditLogs.queries.getStats) ────────────────────────────────

export interface AuditStats {
  total: number;
  bySeverity: Record<AuditSeverity, number>;
  byObjectType: Record<string, number>;
  topActors: Array<{
    actorId: string;
    actorName: string;
    count: number;
  }>;
  recentCritical: Array<{
    _id: string;
    description: string;
    severity: AuditSeverity;
    actorName?: string;
    occurredAt: number;
  }>;
}

// ─── Filter State ───────────────────────────────────────────────────────────

export interface AuditFilter {
  severity?: AuditSeverity;
  system?: string;
  actorId?: string;
  objectType?: AuditObjectType;
  eventCode?: string;
  search?: string;
  dateFrom?: number;
  dateTo?: number;
}

// ─── Export Options ─────────────────────────────────────────────────────────

export interface AuditExportOptions {
  format: "csv" | "json";
  dateFrom?: number;
  dateTo?: number;
  severity?: AuditSeverity;
  objectType?: AuditObjectType;
  actorId?: string;
  eventCode?: string;
  maxRecords?: number;
  includePayload?: boolean;
}

// ─── Export Result ──────────────────────────────────────────────────────────

export interface AuditExportResult {
  url: string;
  fileName: string;
  recordCount: number;
  fileSize: number;
}

// ─── Clear Options ──────────────────────────────────────────────────────────

export interface AuditClearOptions {
  mode: "before_date" | "by_severity" | "expired";
  beforeDate?: number;
  severity?: AuditSeverity;
  dryRun?: boolean;
  confirmPhrase?: string;
}

// ─── Clear Result ───────────────────────────────────────────────────────────

export interface AuditClearResult {
  deletedCount: number;
  oldestRemaining?: number;
  isDryRun: boolean;
}

// ─── Stats Period ───────────────────────────────────────────────────────────

export type AuditStatsPeriod = "today" | "week" | "month";
