/**
 * ConvexPress Forms — Entry Export (Form Analytics & Export System).
 * API paths:
 *   api.extensions.forms.export.exportEntries           (admin action → CSV)
 *   internal.extensions.forms.export.{resolveColumns,emitExported}
 *
 * `exportEntries` streams a submission CSV: metadata columns + one column per
 * non-layout field (in menuOrder), cells decoded from the JSON-encoded
 * `fieldValues.value`. It requires `form.export_entries` and emits
 * `form.entries_exported` after assembly.
 *
 * Actions cannot call `emitEvent` directly (it needs a MutationCtx) — the emit
 * goes through the `emitExported` internalMutation wrapper (mirrors
 * auditLogs/internals.ts → emitExportEvent).
 *
 * CAPABILITY TYPING: `form.export_entries` is SURFACED here but REGISTERED by the
 * Role/Capability expert — cast at the requireCan call site.
 */

import { action, internalMutation, internalQuery } from "../../_generated/server";
import { v } from "convex/values";
import { internal, api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { requireCan } from "../../helpers/permissions";
import { emitEvent } from "../../helpers/events";
import { FORM_EVENTS, SYSTEM } from "../../events/constants";
import type { Capability } from "../../types/capabilities";

// ─── Constants ──────────────────────────────────────────────────────────────

const EXPORT_PAGE_SIZE = 500;

/** Layout / no-value field types excluded from CSV columns. */
const LAYOUT_OR_NO_VALUE = new Set([
  "message",
  "accordion",
  "tab",
  "page_break",
  "captcha",
  "honeypot",
]);

const submissionStatus = v.union(
  v.literal("complete"),
  v.literal("partial"),
  v.literal("spam"),
  v.literal("deleted"),
);

function formCap(cap: string): Capability {
  return cap as Capability;
}

// ─── Module-local helpers ───────────────────────────────────────────────────

/**
 * Decode a JSON-encoded `fieldValues.value` to a CSV-safe scalar string.
 * Arrays → "; "-joined; objects → JSON; scalars → String(). On a parse failure,
 * fall back to the raw string (it may already be a plain value).
 */
export function decodeCell(raw: string | undefined): string {
  if (raw == null) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => (x == null ? "" : String(x))).join("; ");
    }
    if (parsed && typeof parsed === "object") {
      return JSON.stringify(parsed);
    }
    return String(parsed);
  } catch {
    return raw;
  }
}

/** Quote a CSV cell when it contains a comma, quote, or newline. */
function csvCell(s: string): string {
  const value = s ?? "";
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Encode an array of cell strings into one CSV row. */
function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(",");
}

/** A short, human-friendly id (last 8 chars of the Convex id). */
function shortId(id: string): string {
  return id.length > 8 ? id.slice(-8) : id;
}

/** ISO-format an epoch-ms timestamp, or "" when absent. */
function iso(ms: number | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

// ─── resolveColumns (internal query) ────────────────────────────────────────

/**
 * Resolve the data columns for a form's CSV: the non-layout field definitions,
 * in menuOrder. When `fields` (a list of field NAMEs) is given, filter + order
 * to those — silently dropping names with no matching def and collecting the
 * dropped names into `warnings`.
 */
export const resolveColumns = internalQuery({
  args: {
    formId: v.id("forms"),
    fields: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { formId, fields }) => {
    const form = await ctx.db.get(formId);
    const groupId = form?.fieldGroupId;
    if (!groupId) return { columns: [], warnings: [] as string[] };

    const defs = await ctx.db
      .query("fieldDefinitions")
      .withIndex("by_group", (q: any) => q.eq("groupId", groupId))
      .collect();

    const dataDefs = defs.filter((d: any) => !LAYOUT_OR_NO_VALUE.has(d.type));

    let columns = dataDefs.map((d: any) => ({
      name: d.name as string,
      label: (d.label as string) || (d.name as string),
      key: d.key as string,
    }));

    const warnings: string[] = [];
    if (fields && fields.length > 0) {
      const byName = new Map(columns.map((c) => [c.name, c]));
      const ordered: typeof columns = [];
      for (const name of fields) {
        const col = byName.get(name);
        if (col) ordered.push(col);
        else warnings.push(name);
      }
      columns = ordered;
    }

    return { columns, warnings };
  },
});

// ─── emitExported (internal mutation — audit emit wrapper) ──────────────────

/**
 * Emit `form.entries_exported` from the action (actions can't emitEvent
 * directly). `exportedBy` is optional — emitEvent auto-resolves the actor from
 * ctx.auth, so the action may omit it.
 */
export const emitExported = internalMutation({
  args: {
    formId: v.id("forms"),
    count: v.number(),
    exportedBy: v.optional(v.string()),
  },
  handler: async (ctx, { formId, count, exportedBy }) => {
    await emitEvent(
      ctx,
      FORM_EVENTS.ENTRIES_EXPORTED,
      SYSTEM.FORMS,
      { formId, count, format: "csv", exportedBy },
      exportedBy ? { actorId: exportedBy } : undefined,
    );
  },
});

// ─── exportEntries (admin action → CSV) ─────────────────────────────────────

/**
 * Build a submission CSV for a form. Requires `form.export_entries`. Default
 * status filter = ["complete"] when `statuses` omitted. Header-only CSV when
 * zero rows match (still returns + still emits the audit event).
 */
/** Capability gate for the export action (actions lack the read ctx requireCan needs). */
export const assertExportAuth = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, formCap("form.export_entries"));
    return null;
  },
});

export const exportEntries = action({
  args: {
    formId: v.id("forms"),
    statuses: v.optional(v.array(submissionStatus)),
    fields: v.optional(v.array(v.string())),
    format: v.optional(v.literal("csv")),
  },
  handler: async (ctx, { formId, statuses, fields }) => {
    // Actions lack a read ctx, so the capability gate runs in an internalQuery.
    await ctx.runQuery(internal.extensions.forms.export.assertExportAuth, {});

    const { columns, warnings } = await ctx.runQuery(
      internal.extensions.forms.export.resolveColumns,
      { formId, fields },
    );

    const wantStatuses = new Set(
      statuses && statuses.length > 0 ? statuses : ["complete"],
    );

    // Header row: metadata columns + one column per data field (by label).
    const header = [
      "entry_id",
      "status",
      "submitted_at",
      "completed_at",
      "source",
      ...columns.map((c: { name: string; label: string }) => c.label),
    ];
    const lines: string[] = [csvRow(header)];

    let count = 0;
    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page: any = await ctx.runQuery(
        api.extensions.forms.queries.listSubmissions,
        {
          formId,
          paginationOpts: { cursor, numItems: EXPORT_PAGE_SIZE },
          status: undefined,
        },
      );

      for (const row of page.page as any[]) {
        if (!wantStatuses.has(row.status)) continue;

        const detail: any = await ctx.runQuery(
          api.extensions.forms.queries.getSubmission,
          { id: row._id },
        );
        const byName = new Map<string, string>();
        for (const valueRow of (detail?.values ?? []) as any[]) {
          if (valueRow.fieldName) byName.set(valueRow.fieldName, valueRow.value);
        }

        const cells = [
          shortId(row._id),
          row.status,
          iso(row.submittedAt),
          iso(row.completedAt),
          row.referrer ?? "",
          ...columns.map((c: { name: string; label: string }) => decodeCell(byName.get(c.name))),
        ];
        lines.push(csvRow(cells));
        count += 1;
      }

      isDone = page.isDone;
      cursor = page.continueCursor ?? null;
      if (cursor == null) isDone = true;
    }

    const csv = lines.join("\n");

    // Emit the audit event AFTER assembly (actor auto-resolved by emitEvent).
    await ctx.runMutation(internal.extensions.forms.export.emitExported, {
      formId,
      count,
    });

    return {
      format: "csv" as const,
      count,
      filename: `form-${formId}-entries.csv`,
      csv,
      warnings,
    };
  },
});
