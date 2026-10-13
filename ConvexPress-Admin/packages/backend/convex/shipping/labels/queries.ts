import { query } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";
import { getLabelArgs, listLabelsArgs } from "./validators";

import { v } from "convex/values";
import { shippingDocs } from "../../schema/shipping.docs.generated";
export const listForOrder = query({
  args: listLabelsArgs,
  returns: v.array(shippingDocs.commerce_shipment_labels),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.labels.read");
    return ctx.db
      .query("commerce_shipment_labels")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
  },
});

export const get = query({
  args: getLabelArgs,
  returns: v.union(v.null(), shippingDocs.commerce_shipment_labels),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.labels.read");
    return ctx.db.get(args.labelId);
  },
});
