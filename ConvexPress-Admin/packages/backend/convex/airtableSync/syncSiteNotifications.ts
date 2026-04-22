/**
 * Airtable Sync - Site Notification Definitions
 *
 * Syncs from Airtable table tblAQZWvnLT4ygl0j (30 records) into Convex
 * `siteNotificationDefinitions` table.
 *
 * Resolves linked records:
 *   - Events -> event codes
 *   - Systems -> system name
 */

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  fetchAirtableRecords,
  buildLookupMap,
  resolveLinkedRecords,
  getString,
  getNumber,
  getBoolean,
} from "../helpers/airtable";

// Airtable table IDs
const SITE_NOTIF_TABLE = "tblAQZWvnLT4ygl0j";
const EVENTS_TABLE = "tblDQOlXXJO1aQapT";
const SYSTEMS_TABLE = "tblmiSawf6mIf56V8";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const syncSiteNotifications = internalAction({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const [eventMap, systemMap, records] = await Promise.all([
      buildLookupMap(EVENTS_TABLE, "Event Code"),
      buildLookupMap(SYSTEMS_TABLE, "Name"),
      fetchAirtableRecords(SITE_NOTIF_TABLE),
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

        const notifData = {
          name,
          messageTemplate: getString(fields, "Message Template"),
          notificationType: getString(fields, "Notification Type") ?? "Info",
          status: getString(fields, "Status") ?? "Active",
          persistent: getBoolean(fields, "Persistent"),
          recipientType: getString(fields, "Recipient Type"),
          actionUrl: getString(fields, "Action URL"),
          notes: getString(fields, "Notes"),
          auditStatus: getString(fields, "Audit Status"),
          completion: getNumber(fields, "Completion"),
          eventCodes: resolveLinkedRecords(fields["Events"], eventMap),
          systemName: resolveLinkedRecords(fields["Systems"], systemMap)[0],
          airtableRecordId: record.id,
          syncedAt: now,
        };

        const existing = await ctx.runQuery(
          internal.airtableSync._internal.getSiteNotifDefByAirtableId,
          { airtableRecordId: record.id },
        );

        if (existing) {
          await ctx.runMutation(
            internal.airtableSync._internal.updateSiteNotifDef,
            { id: existing._id, ...notifData },
          );
          updated++;
        } else {
          await ctx.runMutation(
            internal.airtableSync._internal.insertSiteNotifDef,
            notifData,
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
