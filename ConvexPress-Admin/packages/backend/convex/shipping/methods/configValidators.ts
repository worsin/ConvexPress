/**
 * PRDs B1-B9 — exact argument shapes for method configs.
 *
 * Every method type stores its config as one row of its own
 * `commerce_shipping_method_<type>` table, so a config is exactly that table's
 * fields. They are taken from the schema definition, with three changes:
 *
 * - server-managed stamps are left out: `createdAt`/`updatedAt` always, and
 *   `createdBy`/`updatedBy` on create (an update accepts them only because the
 *   method editor sends a loaded row back; the handler ignores them);
 * - `enabled` and `sortOrder` are optional on create, where the handler
 *   defaults them;
 * - the three columns the schema still stores as `v.any()` get their real
 *   shape: dimensional and quantity-based class overrides (per-class tiers,
 *   like weight-based ones) and table-rate row conditions (a rule AST, or the
 *   editor's empty `{}` for a row whose condition is not written yet, which
 *   never matches).
 *
 * Method type and config are separate arguments, so the args validator accepts
 * a config of any method type; `requireMethodConfig`/`requireMethodPatch`
 * check it against the requested type.
 */
import { ConvexError, v, type Infer } from "convex/values";
import { omit } from "convex-helpers";
import { partial, validate } from "convex-helpers/validators";

import { shippingTables } from "../../schema/shipping";
import { ruleAstValidator } from "../rulesEngine/astValidator";
import type { MethodType } from "./tables";

const weightTierValidator = v.object({
  minWeight: v.number(),
  maxWeight: v.optional(v.number()),
  cost: v.number(),
  incrementalCost: v.optional(v.number()),
  incrementalWeight: v.optional(v.number()),
});

const countTierValidator = v.object({
  minCount: v.number(),
  maxCount: v.optional(v.number()),
  cost: v.number(),
  incrementalCost: v.optional(v.number()),
  incrementalCount: v.optional(v.number()),
});

/** Per-class weight tiers (dimensional; same shape as weight-based overrides). */
const weightClassOverridesValidator = v.array(
  v.object({ classId: v.id("commerce_shipping_classes"), tiers: v.array(weightTierValidator) }),
);

/** Per-class count tiers (quantity-based; read by quantityBased.ts). */
const countClassOverridesValidator = v.array(
  v.object({ classId: v.id("commerce_shipping_classes"), tiers: v.array(countTierValidator) }),
);

/** A table-rate row condition: a rule AST, or `{}` for a row with no condition yet. */
export const tableRateConditionValidator = v.union(ruleAstValidator, v.object({}));

const tableRateRowValidator = v.object({
  ...shippingTables.commerce_shipping_method_table_rate.validator.fields.rows.element.fields,
  conditionAST: tableRateConditionValidator,
});

const stamps = ["createdAt", "updatedAt", "createdBy", "updatedBy", "enabled", "sortOrder"] as const;
const createDefaults = { enabled: v.optional(v.boolean()), sortOrder: v.optional(v.number()) };

const fields = {
  flat_rate: shippingTables.commerce_shipping_method_flat_rate.validator.fields,
  weight_based: shippingTables.commerce_shipping_method_weight_based.validator.fields,
  dimensional: {
    ...shippingTables.commerce_shipping_method_dimensional.validator.fields,
    classOverrides: v.optional(weightClassOverridesValidator),
  },
  price_based: shippingTables.commerce_shipping_method_price_based.validator.fields,
  quantity_based: {
    ...shippingTables.commerce_shipping_method_quantity_based.validator.fields,
    classOverrides: v.optional(countClassOverridesValidator),
  },
  free: shippingTables.commerce_shipping_method_free.validator.fields,
  local_pickup: shippingTables.commerce_shipping_method_local_pickup.validator.fields,
  local_delivery: shippingTables.commerce_shipping_method_local_delivery.validator.fields,
  table_rate: {
    ...shippingTables.commerce_shipping_method_table_rate.validator.fields,
    rows: v.array(tableRateRowValidator),
  },
};

/** A new method's config, per method type. */
export const methodConfigValidators = {
  flat_rate: v.object({ ...omit(fields.flat_rate, [...stamps]), ...createDefaults }),
  weight_based: v.object({ ...omit(fields.weight_based, ["createdAt", "updatedAt", "enabled", "sortOrder"]), ...createDefaults }),
  dimensional: v.object({ ...omit(fields.dimensional, ["createdAt", "updatedAt", "enabled", "sortOrder"]), ...createDefaults }),
  price_based: v.object({ ...omit(fields.price_based, ["createdAt", "updatedAt", "enabled", "sortOrder"]), ...createDefaults }),
  quantity_based: v.object({ ...omit(fields.quantity_based, ["createdAt", "updatedAt", "enabled", "sortOrder"]), ...createDefaults }),
  free: v.object({ ...omit(fields.free, ["createdAt", "updatedAt", "enabled", "sortOrder"]), ...createDefaults }),
  local_pickup: v.object({ ...omit(fields.local_pickup, ["createdAt", "updatedAt", "enabled", "sortOrder"]), ...createDefaults }),
  local_delivery: v.object({ ...omit(fields.local_delivery, ["createdAt", "updatedAt", "enabled", "sortOrder"]), ...createDefaults }),
  table_rate: v.object({ ...omit(fields.table_rate, ["createdAt", "updatedAt", "enabled", "sortOrder"]), ...createDefaults }),
} satisfies Record<MethodType, unknown>;

/** Fields an update may change, per method type (every field optional). */
export const methodPatchValidators = {
  flat_rate: partial(v.object(omit(fields.flat_rate, ["createdAt", "updatedAt"]))),
  weight_based: partial(v.object(omit(fields.weight_based, ["createdAt", "updatedAt"]))),
  dimensional: partial(v.object(omit(fields.dimensional, ["createdAt", "updatedAt"]))),
  price_based: partial(v.object(omit(fields.price_based, ["createdAt", "updatedAt"]))),
  quantity_based: partial(v.object(omit(fields.quantity_based, ["createdAt", "updatedAt"]))),
  free: partial(v.object(omit(fields.free, ["createdAt", "updatedAt"]))),
  local_pickup: partial(v.object(omit(fields.local_pickup, ["createdAt", "updatedAt"]))),
  local_delivery: partial(v.object(omit(fields.local_delivery, ["createdAt", "updatedAt"]))),
  table_rate: partial(v.object(omit(fields.table_rate, ["createdAt", "updatedAt"]))),
} satisfies Record<MethodType, unknown>;

export type MethodConfig<T extends MethodType> = Infer<(typeof methodConfigValidators)[T]>;
export type MethodPatch<T extends MethodType> = Infer<(typeof methodPatchValidators)[T]>;

/** Any method type's config: the args shape of createMethod and previewMethod. */
export const anyMethodConfigValidator = v.union(
  methodConfigValidators.flat_rate,
  methodConfigValidators.weight_based,
  methodConfigValidators.dimensional,
  methodConfigValidators.price_based,
  methodConfigValidators.quantity_based,
  methodConfigValidators.free,
  methodConfigValidators.local_pickup,
  methodConfigValidators.local_delivery,
  methodConfigValidators.table_rate,
);

/** Any method type's patch: the args shape of updateMethod. */
export const anyMethodPatchValidator = v.union(
  methodPatchValidators.flat_rate,
  methodPatchValidators.weight_based,
  methodPatchValidators.dimensional,
  methodPatchValidators.price_based,
  methodPatchValidators.quantity_based,
  methodPatchValidators.free,
  methodPatchValidators.local_pickup,
  methodPatchValidators.local_delivery,
  methodPatchValidators.table_rate,
);

function mismatch(methodType: MethodType, what: string): never {
  throw new ConvexError({ code: "VALIDATION_ERROR", message: `The ${what} does not match the ${methodType} method's fields.` });
}

/** The config, checked against the shape of `methodType`. */
export function requireMethodConfig<T extends MethodType>(methodType: T, config: Infer<typeof anyMethodConfigValidator>): MethodConfig<T> {
  const validator: (typeof methodConfigValidators)[T] = methodConfigValidators[methodType];
  if (!validate(validator, config)) return mismatch(methodType, "config");
  return config;
}

/** The patch, checked against the shape of `methodType`. */
export function requireMethodPatch<T extends MethodType>(methodType: T, patch: Infer<typeof anyMethodPatchValidator>): MethodPatch<T> {
  const validator: (typeof methodPatchValidators)[T] = methodPatchValidators[methodType];
  if (!validate(validator, patch)) return mismatch(methodType, "patch");
  return patch;
}
