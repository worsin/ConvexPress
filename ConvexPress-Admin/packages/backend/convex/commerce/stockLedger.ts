import type { IndexRangeBuilder } from "convex/server";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { readRecordedStockTarget } from "./stockTarget";
import { patchDynamicWithMediaReferences } from "../media/attachmentGuard";

/** Return physical units to their recorded owner/location, even after policy edits. */
export async function restoreRecordedOrderStock(ctx: MutationCtx, order: {_id:Id<"commerce_orders">;inventoryPolicyVersion?:number}, actorUserId?:Id<"users">):Promise<boolean> {
  const rows:Doc<"commerce_inventory_adjustments">[]=await ctx.db.query("commerce_inventory_adjustments").withIndex("by_order",(q:IndexRangeBuilder<Doc<"commerce_inventory_adjustments">,["orderId","_creationTime"]>)=>q.eq("orderId",order._id)).take(2001);
  if(rows.length>2000)throw new ConvexError({code:"INVENTORY_CAPACITY",message:"Order inventory history exceeds the supported request budget."});
  const allocations=rows.filter(row=>(row.adjustmentType==="sale"||row.adjustmentType==="order_allocation") && row.quantityDelta<0);
  if(!allocations.length)return order.inventoryPolicyVersion===1;
  if(rows.some(row=>row.adjustmentType==="order_release"))return true;
  for(const allocation of allocations){
    const target=await readRecordedStockTarget(ctx,allocation.productId,allocation.variantId);
    let patchId=target.patchId as Id<"commerce_products">|Id<"commerce_product_variants">|Id<"commerce_inventory_levels">;
    let stockQuantity=target.stockQuantity;
    if(allocation.locationId){
      const levels=await ctx.db.query("commerce_inventory_levels").withIndex("by_product_location",q=>q.eq("productId",allocation.productId).eq("locationId",allocation.locationId!)).take(201);
      if(levels.length>200)throw new ConvexError({code:"INVENTORY_CAPACITY",message:"Inventory location exceeds the supported request budget."});
      const matching=levels.filter(level=>level.variantId===allocation.variantId);
      if(matching.length!==1)throw new ConvexError({code:"INVENTORY_TARGET_MISSING",message:"The original inventory location needs review."});
      patchId=matching[0]._id;stockQuantity=matching[0].stockQuantity;
    }
    const nextStock=stockQuantity-allocation.quantityDelta;
    if(!Number.isSafeInteger(nextStock))throw new ConvexError({code:"INVALID_STOCK",message:"Inventory quantity exceeds the supported range."});
    await patchDynamicWithMediaReferences(ctx,patchId,{stockQuantity:nextStock,updatedAt:Date.now()});
    await ctx.db.insert("commerce_inventory_adjustments",{productId:allocation.productId,variantId:allocation.variantId,locationId:allocation.locationId,orderId:order._id,adjustmentType:"order_release",quantityDelta:-allocation.quantityDelta,actorUserId,reason:"Returned to the recorded inventory owner",createdAt:Date.now()});
  }
  return true;
}
