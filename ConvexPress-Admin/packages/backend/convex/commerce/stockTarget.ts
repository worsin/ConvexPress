import type { IndexRangeBuilder } from "convex/server";
import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import { resolveStockPolicy } from "./stockPolicy";

type StockTarget = {product:Doc<"commerce_products">;variant:Doc<"commerce_product_variants">|null;policy:ReturnType<typeof resolveStockPolicy>;inventoryVariantId:Id<"commerce_product_variants">|undefined;patchId:Id<"commerce_products">|Id<"commerce_product_variants">;stockQuantity:number;label:string};

export async function readStockTarget(ctx: Pick<QueryCtx,"db">, productId: Id<"commerce_products">, variantId?: Id<"commerce_product_variants">, options: {allowParent?:boolean} = {}):Promise<StockTarget> {
  const product:Doc<"commerce_products">|null=await ctx.db.get(productId);
  if(!product)throw new ConvexError({code:"NOT_FOUND",message:"Product not found."});
  const variant:Doc<"commerce_product_variants">|null=variantId ? await ctx.db.get(variantId) : null;
  if((product.productType==="variable" && !variantId && !options.allowParent) || (variantId && (!variant || variant.productId!==productId)))
    throw new ConvexError({code:"VALIDATION_ERROR",message:"Select a valid variant for this product."});
  const policy=resolveStockPolicy(product,variant);
  const inventoryVariantId=variant && policy.mode!=="parent" ? variant._id : undefined;
  return {product,variant,policy,inventoryVariantId,patchId:inventoryVariantId??product._id,
    stockQuantity:policy.stockQuantity,label:variant?`${product.title} - ${variant.title}`:product.title};
}

/** Reservations persist the stock owner, which must survive later mode changes. */
export async function readRecordedStockTarget(ctx: Pick<QueryCtx,"db">, productId: Id<"commerce_products">, inventoryVariantId?: Id<"commerce_product_variants">):Promise<{product:Doc<"commerce_products">;variant:Doc<"commerce_product_variants">|null;patchId:Id<"commerce_products">|Id<"commerce_product_variants">;stockQuantity:number}> {
  const product:Doc<"commerce_products">|null=await ctx.db.get(productId);
  const variant:Doc<"commerce_product_variants">|null=inventoryVariantId?await ctx.db.get(inventoryVariantId):null;
  if(!product || (inventoryVariantId && (!variant || variant.productId!==productId)))
    throw new ConvexError({code:"INVENTORY_TARGET_MISSING",message:"The reserved inventory target needs review."});
  const owner=variant??product;
  return {product,variant,patchId:owner._id,stockQuantity:owner.stockQuantity??0};
}

export async function readReservedStock(ctx: Pick<QueryCtx,"db">, productId: Id<"commerce_products">, variantId?: Id<"commerce_product_variants">, locationId?: Id<"commerce_ship_from_locations">, budget?: RequestReadLedger, now = Date.now()):Promise<number> {
  budget?.beforeRead();
  const rows:Doc<"commerce_stock_reservations">[]=await ctx.db.query("commerce_stock_reservations").withIndex("by_product_variant_status",(q:IndexRangeBuilder<Doc<"commerce_stock_reservations">,["productId","variantId","status","_creationTime"]>)=>q.eq("productId",productId).eq("variantId",variantId).eq("status","active")).take(2001);
  for (const row of rows) {
    budget?.record(row);
    if (row.locationId === locationId) budget?.noteAuthorizationBoundary(row.expiresAt, now);
  }
  if(rows.length>2000)throw new ConvexError({code:"INVENTORY_CAPACITY",message:"Inventory reservations exceed the supported request budget."});
  return rows.filter(row=>row.expiresAt>now && row.locationId===locationId).reduce((sum,row)=>sum+row.quantity,0);
}

export async function readCheckoutReservations(ctx:Pick<QueryCtx,"db">, checkoutSessionId:Id<"commerce_checkout_sessions">):Promise<Doc<"commerce_stock_reservations">[]> {
  const rows=await ctx.db.query("commerce_stock_reservations").withIndex("by_checkout_status",(q:IndexRangeBuilder<Doc<"commerce_stock_reservations">,["checkoutSessionId","status","_creationTime"]>)=>q.eq("checkoutSessionId",checkoutSessionId).eq("status","active")).take(201);
  if(rows.length>200)throw new ConvexError({code:"INVENTORY_CAPACITY",message:"Checkout reservations exceed the supported request budget."});
  return rows;
}
