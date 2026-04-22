/**
 * Airtable Sync - Roles
 *
 * Syncs from Airtable table tblquj6encuzq7p1f (5 records) into Convex
 * `roles` table.
 *
 * Resolves linked records:
 *   - Capabilities (Actions) -> action codes
 *   - Page Access (Routes) -> route paths
 *
 * This sync updates EXISTING roles (matched by slug) or creates new ones.
 * It backfills missing fields (capabilities, pageAccess, etc.) on stale roles.
 *
 * Dependency contract:
 *   - Capabilities and Routes are synced first in the same run.
 *   - Role capability/pageAccess links are then written from Airtable links.
 * This ensures roles always line up with the current Convex capability/route data.
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
import { LEGACY_ROLE_MAP } from "../seed/roles";

// Airtable table IDs
const ROLES_TABLE = "tblquj6encuzq7p1f";
const CAPABILITIES_TABLE = "tblQTSboBXFiXSP3O";
const ROUTES_TABLE = "tblgdxTFKRbmuQ2qx";

const ROLE_SLUG_ALIASES: Record<string, string> = {
  ...LEGACY_ROLE_MAP,
  administrator: "administrator",
  subscriber: "subscriber",
};

function toCanonicalRoleSlug(rawSlug: string): string {
  const normalized = rawSlug.trim().toLowerCase();
  return ROLE_SLUG_ALIASES[normalized] ?? normalized;
}

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const syncRoles = internalAction({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    // Keep dependent tables current so role links always align in the DB.
    await ctx.runAction(internal.airtableSync.syncCapabilities.syncCapabilities, {});
    await ctx.runAction(internal.airtableSync.syncRoutes.syncRoutes, {});

    // Build lookup maps for linked records
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const [capabilityMap, routeMap, records] = await Promise.all([
      buildLookupMap(CAPABILITIES_TABLE, "Action Code"),
      buildLookupMap(ROUTES_TABLE, "Path"),
      fetchAirtableRecords(ROLES_TABLE),
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
        const rawSlug = getString(fields, "Slug");
        const slug = rawSlug ? toCanonicalRoleSlug(rawSlug) : undefined;

        if (!name || !slug) {
          errors.push(`Skipped record ${record.id}: missing Name or Slug`);
          continue;
        }

        // Map Airtable type to Convex union
        const rawType = (getString(fields, "Type") ?? "internal").toLowerCase();
        const type = (
          rawType === "internal" || rawType === "customer" || rawType === "system"
            ? rawType
            : "internal"
        ) as "internal" | "customer" | "system";

        // Map status
        const rawStatus = (getString(fields, "Status") ?? "active").toLowerCase();
        const status: "active" | "inactive" =
          rawStatus === "inactive" ? "inactive" : "active";

        const capabilities = resolveLinkedRecords(
          fields["Capabilities"],
          capabilityMap,
        );
        const pageAccess = resolveLinkedRecords(
          fields["Page Access"],
          routeMap,
        );

        const roleData = {
          name,
          slug,
          description: getString(fields, "Description") ?? "",
          level: getNumber(fields, "Level") ?? 0,
          type,
          isDefault: getBoolean(fields, "Is Default"),
          isProtected: true,
          capabilities,
          pageAccess,
          status,
          airtableRecordId: record.id,
          updatedAt: now,
        };

        // Find by both Airtable record ID and canonical slug.
        // If they disagree, prefer canonical slug and merge duplicates.
        const existingByAirtableId = await ctx.runQuery(
          internal.airtableSync._internal.getRoleByAirtableId,
          { airtableRecordId: record.id },
        );
        const existingBySlug = await ctx.runQuery(
          internal.airtableSync._internal.getRoleBySlug,
          { slug },
        );

        let existing = existingBySlug ?? existingByAirtableId;

        if (
          existingByAirtableId &&
          existingBySlug &&
          existingByAirtableId._id !== existingBySlug._id
        ) {
          await ctx.runMutation(
            internal.airtableSync._internal.reassignUsersFromRole,
            {
              fromRoleId: existingByAirtableId._id,
              toRoleId: existingBySlug._id,
            },
          );
          await ctx.runMutation(
            internal.airtableSync._internal.deleteRoleById,
            { roleId: existingByAirtableId._id },
          );
          existing = existingBySlug;
        }

        if (existing) {
          await ctx.runMutation(
            internal.airtableSync._internal.updateRole,
            { id: existing._id, ...roleData },
          );
          updated++;
        } else {
          await ctx.runMutation(
            internal.airtableSync._internal.insertRole,
            { ...roleData, createdAt: now },
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
