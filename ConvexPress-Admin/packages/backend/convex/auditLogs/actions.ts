/**
 * Audit Log System - Export Action
 *
 * Generates CSV or JSON export files from audit entries and uploads them
 * to Convex storage. Supports all the same filters as the list query.
 *
 * This is an action (not a mutation) because it needs to:
 *   1. Stream large datasets in batches
 *   2. Generate file content (potentially large)
 *   3. Upload to Convex storage
 *
 * Usage:
 *   const exportAuditLog = useAction(api.auditLogs.actions.export);
 *   const result = await exportAuditLog({
 *     format: "csv",
 *     dateFrom: Date.now() - 30 * 24 * 60 * 60 * 1000,
 *     maxRecords: 10000,
 *   });
 *   // result.url -> download URL
 */

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import { severityValidator, objectTypeValidator } from "./validators";

// ─── Export Args ──────────────────────────────────────────────────────────────

const exportArgs = {
  actorId: v.optional(v.string()),
  severity: v.optional(severityValidator),
  objectType: v.optional(objectTypeValidator),
  eventCode: v.optional(v.string()),
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
  format: v.union(v.literal("csv"), v.literal("json")),
  maxRecords: v.optional(v.number()),
  includePayload: v.optional(v.boolean()),
};

// ─── List Internal Return Type ────────────────────────────────────────────────

/** Shape returned by internals.listInternal query */
interface ListInternalResult {
  entries: Array<Record<string, unknown>>;
  nextCursor?: string;
}

// ─── CSV Helpers ──────────────────────────────────────────────────────────────

function escapeCSV(value: string | undefined | null): string {
  if (value === undefined || value === null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString();
}

// ─── Export Action ────────────────────────────────────────────────────────────

export const exportAuditLog = action({
  args: exportArgs,
  handler: async (ctx, args) => {
    // ─── 0. Authentication & Authorization ─────────────────────────────
    // Actions cannot use requireCan() directly (it needs MutationCtx/QueryCtx).
    // Instead, verify identity and check capability via internal query.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required to export audit log",
      });
    }

    // Verify the user has the export_audit_log capability via an internal query
    const canExport = await ctx.runQuery(
      internal.auditLogs.internals.checkExportPermission,
      { userId: identity.subject },
    );
    if (!canExport) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You do not have permission to export the audit log",
      });
    }

    // ─── 1. Validate maxRecords ──────────────────────────────────────────
    const maxRecords = Math.min(args.maxRecords ?? 10000, 50000);

    // ─── 2. Validate date range ──────────────────────────────────────────
    if (args.dateFrom && args.dateTo && args.dateFrom > args.dateTo) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "dateFrom must be before dateTo",
      });
    }

    // ─── 3. Fetch entries in batches ─────────────────────────────────────
    const BATCH_SIZE = 500;
    const allEntries: Array<Record<string, unknown>> = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore && allEntries.length < maxRecords) {
      const remaining = maxRecords - allEntries.length;
      const batchLimit = Math.min(BATCH_SIZE, remaining);

      const result = (await ctx.runQuery(
        internal.auditLogs.internals.listInternal,
        {
          actorId: args.actorId,
          severity: args.severity,
          objectType: args.objectType,
          eventCode: args.eventCode,
          dateFrom: args.dateFrom,
          dateTo: args.dateTo,
          cursor,
          limit: batchLimit,
          direction: "older" as const,
        },
      )) as ListInternalResult;

      if (!result || !result.entries || result.entries.length === 0) {
        hasMore = false;
        break;
      }

      allEntries.push(...result.entries);
      cursor = result.nextCursor;
      hasMore = !!cursor;
    }

    // ─── 4. Check for empty result ───────────────────────────────────────
    if (allEntries.length === 0) {
      throw new ConvexError({
        code: "EXPORT_EMPTY",
        message: "No records match the specified filters",
      });
    }

    // ─── 5. Generate file content ────────────────────────────────────────
    const includePayload = args.includePayload ?? false;
    let fileContent: string;
    let contentType: string;

    if (args.format === "csv") {
      fileContent = generateCSV(allEntries, includePayload);
      contentType = "text/csv";
    } else {
      fileContent = generateJSON(allEntries, includePayload);
      contentType = "application/json";
    }

    // ─── 6. Upload to Convex storage ─────────────────────────────────────
    const blob = new Blob([fileContent], { type: contentType });
    const storageId = await ctx.storage.store(blob);
    const url = await ctx.storage.getUrl(storageId);

    if (!url) {
      throw new ConvexError({
        code: "STORAGE_ERROR",
        message: "Failed to generate download URL",
      });
    }

    // ─── 7. Emit audit.exported event ────────────────────────────────────
    await ctx.runMutation(internal.auditLogs.internals.emitExportEvent, {
      format: args.format,
      recordCount: allEntries.length,
      filters: JSON.stringify({
        actorId: args.actorId,
        severity: args.severity,
        objectType: args.objectType,
        eventCode: args.eventCode,
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
      }),
    });

    // ─── 8. Return download info ─────────────────────────────────────────
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const ext = args.format === "csv" ? "csv" : "json";
    const fileName = `audit-log-${dateStr}.${ext}`;

    return {
      url,
      fileName,
      recordCount: allEntries.length,
      fileSize: new Blob([fileContent]).size,
    };
  },
});

// ─── CSV Generator ────────────────────────────────────────────────────────────

function generateCSV(
  entries: Array<Record<string, unknown>>,
  includePayload: boolean,
): string {
  const headers = [
    "Timestamp",
    "ISO Date",
    "Event Code",
    "Action",
    "Severity",
    "Actor Name",
    "Actor Email",
    "Actor Role",
    "Actor IP",
    "Description",
    "Object Type",
    "Object ID",
    "Object Label",
    "System",
    "Changes",
  ];

  if (includePayload) {
    headers.push("Payload");
  }

  const rows = [headers.map(escapeCSV).join(",")];

  for (const entry of entries) {
    const row = [
      escapeCSV(String(entry.occurredAt ?? "")),
      escapeCSV(
        entry.occurredAt ? formatTimestamp(entry.occurredAt as number) : "",
      ),
      escapeCSV(entry.eventCode as string),
      escapeCSV(entry.action as string),
      escapeCSV(entry.severity as string),
      escapeCSV(entry.actorName as string),
      escapeCSV(entry.actorEmail as string),
      escapeCSV(entry.actorRole as string),
      escapeCSV(entry.actorIp as string),
      escapeCSV(entry.description as string),
      escapeCSV(entry.objectType as string),
      escapeCSV(entry.objectId as string),
      escapeCSV(entry.objectLabel as string),
      escapeCSV(entry.system as string),
      escapeCSV(entry.changes as string),
    ];

    if (includePayload) {
      row.push(escapeCSV(entry.rawPayload as string));
    }

    rows.push(row.join(","));
  }

  return rows.join("\n");
}

// ─── JSON Generator ──────────────────────────────────────────────────────────

function generateJSON(
  entries: Array<Record<string, unknown>>,
  includePayload: boolean,
): string {
  const formatted = entries.map((entry) => {
    const obj: Record<string, unknown> = {
      timestamp: entry.occurredAt,
      isoDate: entry.occurredAt
        ? formatTimestamp(entry.occurredAt as number)
        : null,
      eventCode: entry.eventCode,
      action: entry.action,
      severity: entry.severity,
      actorName: entry.actorName ?? null,
      actorEmail: entry.actorEmail ?? null,
      actorRole: entry.actorRole ?? null,
      actorIp: entry.actorIp ?? null,
      description: entry.description,
      objectType: entry.objectType,
      objectId: entry.objectId ?? null,
      objectLabel: entry.objectLabel ?? null,
      system: entry.system,
      changes: entry.changes ?? null,
    };

    if (includePayload) {
      obj.rawPayload = entry.rawPayload ?? null;
    }

    return obj;
  });

  return JSON.stringify(formatted, null, 2);
}
