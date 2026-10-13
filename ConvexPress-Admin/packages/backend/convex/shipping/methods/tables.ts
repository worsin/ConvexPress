/**
 * Typed access to the per-type shipping method tables (PRDs B1-B9).
 *
 * Every method type lives in its own `commerce_shipping_method_<type>` table
 * and every one of those tables carries `by_zone` / `by_zone_sort` indexes, so
 * zone-scoped reads can be written once over the whole union of tables.
 */
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

export const METHOD_TYPES = [
  "flat_rate",
  "weight_based",
  "dimensional",
  "price_based",
  "quantity_based",
  "free",
  "local_pickup",
  "local_delivery",
  "table_rate",
] as const;

export type MethodType = (typeof METHOD_TYPES)[number];

/**
 * The table for each method type, spelled out rather than built from a template
 * (`commerce_shipping_method_${type}`): explicit table names stay greppable and
 * survive hosts that mount ConvexPress under renamed tables.
 */
export const METHOD_TABLES = {
  flat_rate: "commerce_shipping_method_flat_rate",
  weight_based: "commerce_shipping_method_weight_based",
  dimensional: "commerce_shipping_method_dimensional",
  price_based: "commerce_shipping_method_price_based",
  quantity_based: "commerce_shipping_method_quantity_based",
  free: "commerce_shipping_method_free",
  local_pickup: "commerce_shipping_method_local_pickup",
  local_delivery: "commerce_shipping_method_local_delivery",
  table_rate: "commerce_shipping_method_table_rate",
} as const satisfies Record<MethodType, string>;

export type MethodTable = (typeof METHOD_TABLES)[MethodType];
export type MethodDoc = Doc<MethodTable>;

export function methodTableFor(methodType: MethodType): MethodTable {
  return METHOD_TABLES[methodType];
}

/** A method id is only meaningful inside its own method type's table. */
export function normalizeMethodId(
  ctx: { db: Pick<QueryCtx["db"], "normalizeId"> },
  methodType: MethodType,
  methodId: string,
): Id<MethodTable> | null {
  return ctx.db.normalizeId(methodTableFor(methodType), methodId);
}

/** All rows of one method type attached to a zone, in the zone's sort order. */
export async function listMethodRowsForZone(
  ctx: Pick<QueryCtx, "db">,
  methodType: MethodType,
  zoneId: Id<"commerce_shipping_zones">,
): Promise<MethodDoc[]> {
  return await ctx.db
    .query(methodTableFor(methodType))
    .withIndex("by_zone_sort", (q) => q.eq("zoneId", zoneId))
    .collect();
}

/** Every row of one method type, across all zones. */
export async function listAllMethodRows(
  ctx: Pick<QueryCtx, "db">,
  methodType: MethodType,
): Promise<MethodDoc[]> {
  return await ctx.db.query(methodTableFor(methodType)).collect();
}

/** A method row tagged with its method type, so `config` narrows on `methodType`. */
export type ZoneMethod = {
  [T in MethodType]: { methodType: T; config: Doc<(typeof METHOD_TABLES)[T]> };
}[MethodType];

/**
 * Every method of every type attached to a zone, each tagged with its type.
 * One indexed read per method table; written out per table so each row keeps
 * its own table's document type.
 */
export async function listZoneMethods(
  ctx: Pick<QueryCtx, "db">,
  zoneId: Id<"commerce_shipping_zones">,
): Promise<ZoneMethod[]> {
  const { db } = ctx;
  const methods: ZoneMethod[] = [];
  for (const config of await db.query("commerce_shipping_method_flat_rate").withIndex("by_zone_sort", (q) => q.eq("zoneId", zoneId)).collect()) {
    methods.push({ methodType: "flat_rate", config });
  }
  for (const config of await db.query("commerce_shipping_method_weight_based").withIndex("by_zone_sort", (q) => q.eq("zoneId", zoneId)).collect()) {
    methods.push({ methodType: "weight_based", config });
  }
  for (const config of await db.query("commerce_shipping_method_dimensional").withIndex("by_zone_sort", (q) => q.eq("zoneId", zoneId)).collect()) {
    methods.push({ methodType: "dimensional", config });
  }
  for (const config of await db.query("commerce_shipping_method_price_based").withIndex("by_zone_sort", (q) => q.eq("zoneId", zoneId)).collect()) {
    methods.push({ methodType: "price_based", config });
  }
  for (const config of await db.query("commerce_shipping_method_quantity_based").withIndex("by_zone_sort", (q) => q.eq("zoneId", zoneId)).collect()) {
    methods.push({ methodType: "quantity_based", config });
  }
  for (const config of await db.query("commerce_shipping_method_free").withIndex("by_zone_sort", (q) => q.eq("zoneId", zoneId)).collect()) {
    methods.push({ methodType: "free", config });
  }
  for (const config of await db.query("commerce_shipping_method_local_pickup").withIndex("by_zone_sort", (q) => q.eq("zoneId", zoneId)).collect()) {
    methods.push({ methodType: "local_pickup", config });
  }
  for (const config of await db.query("commerce_shipping_method_local_delivery").withIndex("by_zone_sort", (q) => q.eq("zoneId", zoneId)).collect()) {
    methods.push({ methodType: "local_delivery", config });
  }
  for (const config of await db.query("commerce_shipping_method_table_rate").withIndex("by_zone_sort", (q) => q.eq("zoneId", zoneId)).collect()) {
    methods.push({ methodType: "table_rate", config });
  }
  return methods;
}
