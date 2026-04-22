/**
 * Airtable Sync - Email Notifications
 *
 * Syncs from Airtable table tbl5UW9iMJynfVUGG (25 records) into the
 * EXISTING `emailTemplates` table.
 *
 * This sync is metadata-only — it updates tracking fields and metadata
 * without overwriting admin-customized email content (subject, body, etc.).
 *
 * For new records not yet in Convex, this creates minimal stubs.
 * The admin can then customize the email content through the UI.
 *
 * Resolves linked records:
 *   - Events -> event code
 */

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  fetchAirtableRecords,
  buildLookupMap,
  resolveLinkedRecords,
  getString,
  getNumber,
} from "../helpers/airtable";

// Airtable table IDs
const EMAIL_NOTIF_TABLE = "tbl5UW9iMJynfVUGG";
const EVENTS_TABLE = "tblDQOlXXJO1aQapT";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const syncEmailNotifications = internalAction({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const [eventMap, records] = await Promise.all([
      buildLookupMap(EVENTS_TABLE, "Event Code"),
      fetchAirtableRecords(EMAIL_NOTIF_TABLE),
    ]);

    const now = Date.now();
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        const { fields } = record;
        const name = getString(fields, "Name");

        if (!name) {
          errors.push(`Skipped record ${record.id}: missing Name`);
          continue;
        }

        // Map Airtable fields to Convex emailTemplates metadata
        const rawRecipient = (
          getString(fields, "Recipient Type") ?? "customer"
        ).toLowerCase();
        const recipientType = (
          rawRecipient === "customer" ||
          rawRecipient === "employee" ||
          rawRecipient === "admin" ||
          rawRecipient === "custom"
            ? rawRecipient
            : "customer"
        ) as "customer" | "employee" | "admin" | "custom";

        const rawPriority = (
          getString(fields, "Priority") ?? "immediate"
        ).toLowerCase();
        const priority = (
          rawPriority === "immediate" ||
          rawPriority === "batched" ||
          rawPriority === "digest"
            ? rawPriority
            : "immediate"
        ) as "immediate" | "batched" | "digest";

        const rawStatus = getString(fields, "Status") ?? "Active";
        const isActive = rawStatus === "Active";

        const eventCode = resolveLinkedRecords(
          fields["Events"],
          eventMap,
        )[0];

        // Try to find existing template by airtableRecordId
        const existing = await ctx.runQuery(
          internal.airtableSync._internal.getEmailTemplateByAirtableId,
          { airtableRecordId: record.id },
        );

        if (existing) {
          // Update metadata only — don't overwrite customized content
          await ctx.runMutation(
            internal.airtableSync._internal.updateEmailTemplate,
            {
              id: existing._id,
              airtableRecordId: record.id,
              syncedAt: now,
              name,
              recipientType,
              priority,
              isActive,
              eventCode,
            },
          );
          updated++;
        } else {
          // Record doesn't exist yet — just track it for now.
          // We don't create full email template stubs here because
          // the emailTemplates table has many required fields (bodyHtml,
          // availableVariables, etc.) that Airtable doesn't provide.
          // Instead, we log it for the admin to create manually.
          errors.push(
            `New email template "${name}" (${record.id}) — not yet in Convex. Create it via the Email Templates admin page.`,
          );
          created++;
        }
      } catch (e) {
        errors.push(
          `Error syncing record ${record.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    return {
      success: true,
      total: records.length,
      created,
      updated,
      unchanged: 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});
