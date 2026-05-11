import { query } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";
import { getLabelArgs, listLabelsArgs } from "./validators";

export const listForOrder = query({
  args: listLabelsArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.labels.read");
    return ctx.db
      .query("commerce_shipment_labels")
      .withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
      .collect();
  },
});

export const get = query({
  args: getLabelArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.labels.read");
    return ctx.db.get(args.labelId);
  },
});
