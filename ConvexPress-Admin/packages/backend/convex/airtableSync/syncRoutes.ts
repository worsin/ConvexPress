/**
 * Airtable Sync - Route Definitions
 *
 * Syncs from Airtable table tblgdxTFKRbmuQ2qx (70 records) into Convex
 * `routeDefinitions` table.
 *
 * Resolves linked records:
 *   - Roles -> role names
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
const ROUTES_TABLE = "tblgdxTFKRbmuQ2qx";
const ROLES_TABLE = "tblquj6encuzq7p1f";
const SYSTEMS_TABLE = "tblmiSawf6mIf56V8";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const syncRoutes = internalAction({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const [roleMap, systemMap, records] = await Promise.all([
      buildLookupMap(ROLES_TABLE, "Name"),
      buildLookupMap(SYSTEMS_TABLE, "Name"),
      fetchAirtableRecords(ROUTES_TABLE),
    ]);

    const now = Date.now();
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        const { fields } = record;
        const name = getString(fields, "Name");
        const path = getString(fields, "Path");

        if (!name || !path) {
          errors.push(`Skipped record ${record.id}: missing Name or Path`);
          continue;
        }

        const routeData = {
          name,
          path,
          notes: getString(fields, "Notes"),
          layout: getString(fields, "Layout"),
          authRequired: getBoolean(fields, "Auth Required"),
          routeType: getString(fields, "Type") ?? "Page",
          status: getString(fields, "Status") ?? "Active",
          app: getString(fields, "App"),
          completion: getNumber(fields, "Completion"),
          roleNames: resolveLinkedRecords(fields["Roles"], roleMap),
          systemName: resolveLinkedRecords(fields["Systems"], systemMap)[0],
          airtableRecordId: record.id,
          syncedAt: now,
        };

        const existing = await ctx.runQuery(
          internal.airtableSync._internal.getRouteDefByAirtableId,
          { airtableRecordId: record.id },
        );

        if (existing) {
          await ctx.runMutation(
            internal.airtableSync._internal.updateRouteDef,
            { id: existing._id, ...routeData },
          );
          updated++;
        } else {
          await ctx.runMutation(
            internal.airtableSync._internal.insertRouteDef,
            routeData,
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
