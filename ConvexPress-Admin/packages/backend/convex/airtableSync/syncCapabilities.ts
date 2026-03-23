/**
 * Airtable Sync - Capabilities (Actions)
 *
 * Syncs from Airtable table tblQTSboBXFiXSP3O (137 records) into Convex
 * `capabilities` table.
 *
 * Resolves linked records:
 *   - Category (Action Types) -> category name
 *   - Roles -> role names
 *   - Triggers Events -> event codes
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
const CAPABILITIES_TABLE = "tblQTSboBXFiXSP3O";
const ACTION_TYPES_TABLE = "tblTSUt0pggw74Xt6";
const ROLES_TABLE = "tblquj6encuzq7p1f";
const EVENTS_TABLE = "tblDQOlXXJO1aQapT";
const SYSTEMS_TABLE = "tblmiSawf6mIf56V8";

export const syncCapabilities = internalAction({
  args: {},
  handler: async (ctx) => {
    // Build lookup maps for linked record resolution
    const [categoryMap, roleMap, eventMap, systemMap, records] =
      await Promise.all([
        buildLookupMap(ACTION_TYPES_TABLE, "Name"),
        buildLookupMap(ROLES_TABLE, "Name"),
        buildLookupMap(EVENTS_TABLE, "Event Code"),
        buildLookupMap(SYSTEMS_TABLE, "Name"),
        fetchAirtableRecords(CAPABILITIES_TABLE),
      ]);

    const now = Date.now();
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        const { fields } = record;
        const name = getString(fields, "Name");
        const actionCode = getString(fields, "Action Code");

        if (!name || !actionCode) {
          errors.push(`Skipped record ${record.id}: missing Name or Action Code`);
          continue;
        }

        const capData = {
          name,
          actionCode,
          notes: getString(fields, "Notes"),
          status: getString(fields, "Status") ?? "Active",
          auditStatus: getString(fields, "Audit Status"),
          completion: getNumber(fields, "Completion"),
          category: resolveLinkedRecords(fields["Category"], categoryMap)[0],
          roleNames: resolveLinkedRecords(fields["Roles"], roleMap),
          eventCodes: resolveLinkedRecords(fields["Triggers Events"], eventMap),
          systemName: resolveLinkedRecords(fields["Systems"], systemMap)[0],
          airtableRecordId: record.id,
          syncedAt: now,
        };

        // Check if already exists
        const existing = await ctx.runQuery(
          internal.airtableSync._internal.getCapabilityByAirtableId,
          { airtableRecordId: record.id },
        );

        if (existing) {
          await ctx.runMutation(
            internal.airtableSync._internal.updateCapability,
            { id: existing._id, ...capData },
          );
          updated++;
        } else {
          await ctx.runMutation(
            internal.airtableSync._internal.insertCapability,
            capData,
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
      unchanged,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});
