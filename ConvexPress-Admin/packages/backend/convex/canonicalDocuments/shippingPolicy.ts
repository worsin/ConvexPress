import type { QueryCtx } from "../_generated/server";
import { isPluginEnabled } from "../helpers/plugins";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { evaluateMembershipAccess } from "../membership/access";
import { shippingPolicyArgsSchema, shippingPolicyResultSchema, type ShippingPolicyResult } from "./foundation/shippingPolicyContracts";

/** One indexed, budgeted site-local settings read. No private settings escape. */
export async function readShippingPolicy(ctx: QueryCtx, rawArgs: unknown, budget = new RequestReadLedger()): Promise<ShippingPolicyResult> {
  shippingPolicyArgsSchema.parse(rawArgs);
  if (!await isPluginEnabled(ctx, "commerce", budget)) return { items: [] };
  if (!(await evaluateMembershipAccess(ctx, { resourceType: "route", resourceIdOrKey: "/shop" }, budget)).allowed) return { items: [] };
  budget.beforeRead();
  const settings = budget.record(await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "commerce.general")).unique());
  const values: unknown = settings?.values;
  const items = values && typeof values === "object" && !Array.isArray(values) && "storefrontPromises" in values ? values.storefrontPromises : [];
  return shippingPolicyResultSchema.parse({ items });
}
