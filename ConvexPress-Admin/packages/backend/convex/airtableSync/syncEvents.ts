/**
 * Airtable Sync - Event Definitions
 *
 * Syncs from Airtable table tblDQOlXXJO1aQapT (63 records) into Convex
 * `eventDefinitions` table.
 *
 * Resolves linked records:
 *   - Category (Event Types) -> category name
 *   - Actions -> action codes
 *   - Email Notifications -> notification names
 *   - Site Notifications -> notification names
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
} from "../helpers/airtable";

// Airtable table IDs
const EVENTS_TABLE = "tblDQOlXXJO1aQapT";
const EVENT_TYPES_TABLE = "tbl2RMo2n83E31o5q";
const CAPABILITIES_TABLE = "tblQTSboBXFiXSP3O";
const EMAIL_NOTIF_TABLE = "tbl5UW9iMJynfVUGG";
const SITE_NOTIF_TABLE = "tblAQZWvnLT4ygl0j";
const SYSTEMS_TABLE = "tblmiSawf6mIf56V8";

export const syncEvents = internalAction({
  args: {},
  handler: async (ctx) => {
    const [categoryMap, actionMap, emailMap, siteMap, systemMap, records] =
      await Promise.all([
        buildLookupMap(EVENT_TYPES_TABLE, "Name"),
        buildLookupMap(CAPABILITIES_TABLE, "Action Code"),
        buildLookupMap(EMAIL_NOTIF_TABLE, "Name"),
        buildLookupMap(SITE_NOTIF_TABLE, "Name"),
        buildLookupMap(SYSTEMS_TABLE, "Name"),
        fetchAirtableRecords(EVENTS_TABLE),
      ]);

    const now = Date.now();
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        const { fields } = record;
        const name = getString(fields, "Name");
        const eventCode = getString(fields, "Event Code");

        if (!name || !eventCode) {
          errors.push(`Skipped record ${record.id}: missing Name or Event Code`);
          continue;
        }

        const eventData = {
          name,
          eventCode,
          notes: getString(fields, "Notes"),
          status: getString(fields, "Status") ?? "Active",
          auditStatus: getString(fields, "Audit Status"),
          completion: getNumber(fields, "Completion"),
          payloadSchema: getString(fields, "Payload Schema"),
          category: resolveLinkedRecords(fields["Category"], categoryMap)[0],
          actionCodes: resolveLinkedRecords(fields["Actions"], actionMap),
          emailNotificationNames: resolveLinkedRecords(
            fields["Email Notifications"],
            emailMap,
          ),
          siteNotificationNames: resolveLinkedRecords(
            fields["Site Notifications"],
            siteMap,
          ),
          systemName: resolveLinkedRecords(fields["Systems"], systemMap)[0],
          airtableRecordId: record.id,
          syncedAt: now,
        };

        const existing = await ctx.runQuery(
          internal.airtableSync._internal.getEventDefByAirtableId,
          { airtableRecordId: record.id },
        );

        if (existing) {
          await ctx.runMutation(
            internal.airtableSync._internal.updateEventDef,
            { id: existing._id, ...eventData },
          );
          updated++;
        } else {
          await ctx.runMutation(
            internal.airtableSync._internal.insertEventDef,
            eventData,
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
