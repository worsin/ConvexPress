import { makeFunctionReference, type RegisteredMutation } from "convex/server";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { syncProductSaleIndex } from "./productSaleIndex";
export const rebuild: RegisteredMutation<"internal", Record<string, never>, {
    processed: number;
    done: boolean;
}> = internalMutation({
    args: {}, returns: v.object({ processed: v.number(), done: v.boolean() }), handler: async (ctx: MutationCtx): Promise<{
        processed: number;
        done: boolean;
    }> => {
        const rows = await ctx.db.query("commerce_products").withIndex("by_sale_index_version", q => q.eq("saleIndexVersion", undefined)).take(16);
        for (const row of rows)
            await syncProductSaleIndex(ctx, row._id);
        if (rows.length === 16)
            await ctx.scheduler.runAfter(100, makeFunctionReference<"mutation">("commerce/productSaleMaintenance:rebuild"), {});
        return { processed: rows.length, done: rows.length < 16 };
    }
});
