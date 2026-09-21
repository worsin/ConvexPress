import type { IndexRangeBuilder } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import type { SourceByteLedger } from "../canonicalDocuments/sourceBudget";
/** Four indexed single-row reads, independent of the total variant count.
 * Legacy public status (absent) remains supported without reading hidden rows. */
export async function readPublicCardVariant(ctx: Pick<QueryCtx, "db">, productId: Id<"commerce_products">, budget?: RequestReadLedger, sources?: SourceByteLedger): Promise<Doc<"commerce_product_variants"> | null> {
    const read = async (status: "publish" | undefined, defaults: boolean) => {
        sources?.beforeRead();
        budget?.beforeRead();
        const row = (defaults
            ? await ctx.db.query("commerce_product_variants").withIndex("by_product_status_default", (q: IndexRangeBuilder<Doc<"commerce_product_variants">, [
                "productId",
                "status",
                "isDefault",
                "_creationTime"
            ]>) => q.eq("productId", productId).eq("status", status).eq("isDefault", true)).first()
            : await ctx.db.query("commerce_product_variants").withIndex("by_product_status", (q: IndexRangeBuilder<Doc<"commerce_product_variants">, [
                "productId",
                "status",
                "_creationTime"
            ]>) => q.eq("productId", productId).eq("status", status)).first());
        budget?.record(row);
        if (row)
            sources?.record("variant", row);
        return row;
    };
    const earliest = (left: Doc<"commerce_product_variants"> | null, right: Doc<"commerce_product_variants"> | null) => {
        if (!left)
            return right;
        if (!right)
            return left;
        return left._creationTime < right._creationTime || (left._creationTime === right._creationTime && left._id < right._id) ? left : right;
    };
    const defaults = earliest(await read("publish", true), await read(undefined, true));
    return defaults ?? earliest(await read("publish", false), await read(undefined, false));
}
