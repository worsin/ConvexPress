import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import schema from "../../schema";
import {internal} from "../../_generated/api";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerce/payments.ts": () => import("../payments"),
  "./convex/purchases/internals.ts": () => import("../../purchases/internals"),
  "./convex/commerce/inventory.ts": () => import("../inventory"),
};
async function fixture() {
  const t = convexTest({schema,modules});
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users",{authSource:"local",email:"stock@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
    const product = await ctx.db.insert("commerce_products",{
      title:"Stock fixture",slug:"stock-fixture",status:"publish",productType:"variable",authorId:user,
      basePrice:{amount:100,currencyCode:"USD"},galleryMediaIds:[],categoryIds:[],trackInventory:true,
      stockQuantity:3,allowBackorders:false,isVirtual:true,isDownloadable:false,createdAt:1,updatedAt:1,
    });
    const variant = await ctx.db.insert("commerce_product_variants",{
      productId:product,title:"Parent stock",optionSummary:"Parent stock",price:{amount:100,currencyCode:"USD"},
      manageStock:"parent",isDefault:true,createdAt:1,updatedAt:1,
    });
    const cart = await ctx.db.insert("commerce_carts",{
      sessionToken:"stock-transactions",status:"active",currencyCode:"USD",subtotalAmount:0,discountAmount:0,
      shippingAmount:0,taxAmount:0,totalAmount:0,itemCount:0,lastActiveAt:1,createdAt:1,updatedAt:1,
    });
    const checkout = await ctx.db.insert("commerce_checkout_sessions",{
      cartId:cart,sessionToken:"stock-transactions",status:"ready_for_review",currencyCode:"USD",
      subtotalAmount:0,discountAmount:0,shippingAmount:0,taxAmount:0,totalAmount:0,createdAt:1,updatedAt:1,
    });
    return {product,variant,checkout};
  });
  return {t,ids};
}

test("registered reservation and release preserve indexes, schema and idempotence",async()=>{
  const {t,ids}=await fixture();
  const args={productId:ids.product,variantId:ids.variant,checkoutSessionId:ids.checkout,quantity:1};
  await t.mutation(internal.commerce.inventory.reserve,args);
  await t.mutation(internal.commerce.inventory.reserve,args);
  await expect(t.mutation(internal.commerce.inventory.reserve,{...args,quantity:2})).rejects.toThrow("Insufficient stock");
  await t.run(async ctx=>{
    const rows=await ctx.db.query("commerce_stock_reservations").withIndex("by_checkout_status",q=>q.eq("checkoutSessionId",ids.checkout).eq("status","active")).take(10);
    expect(rows).toHaveLength(2);expect(rows.every(row=>row.variantId===undefined)).toBe(true);
    // Deletion must not strand active holds or require current selection policy.
    await ctx.db.delete(ids.variant);
  });
  expect(await t.mutation(internal.commerce.inventory.release,{checkoutSessionId:ids.checkout})).toEqual({success:true,released:2});
  expect((await t.mutation(internal.commerce.inventory.release,{checkoutSessionId:ids.checkout})).success).toBe(false);
  await t.run(async ctx=>{
    expect((await ctx.db.get(ids.product))?.stockQuantity).toBe(3);
    expect(await ctx.db.query("commerce_inventory_adjustments").withIndex("by_type",q=>q.eq("adjustmentType","release")).take(10)).toHaveLength(2);
  });
});

test("oversized checkout release refuses before changing any reservation",async()=>{
  const {t,ids}=await fixture();
  await t.run(async ctx=>{
    for(let i=0;i<201;i++)await ctx.db.insert("commerce_stock_reservations",{checkoutSessionId:ids.checkout,productId:ids.product,quantity:1,status:"active",expiresAt:Date.now()+60000,createdAt:1,updatedAt:1});
  });
  await expect(t.mutation(internal.commerce.inventory.release,{checkoutSessionId:ids.checkout})).rejects.toThrow("request budget");
  await t.run(async ctx=>{
    expect(await ctx.db.query("commerce_stock_reservations").withIndex("by_checkout_status",q=>q.eq("checkoutSessionId",ids.checkout).eq("status","active")).take(202)).toHaveLength(201);
    expect(await ctx.db.query("commerce_inventory_adjustments").take(1)).toHaveLength(0);
  });
});


async function seedOrder(t:Awaited<ReturnType<typeof fixture>>["t"],ids:Awaited<ReturnType<typeof fixture>>["ids"],count:number) {
  return t.run(ctx=>ctx.db.insert("commerce_orders",{
    orderNumber:"CP-STOCK-TEST",trackingToken:"synthetic-tracking",checkoutSessionId:ids.checkout,
    status:"pending",currencyCode:"USD",email:"stock@example.invalid",
    billingAddress:{firstName:"Synthetic",lastName:"Customer",line1:"123 Test St",city:"Denver",state:"CO",postalCode:"80202",countryCode:"US"},
    subtotalAmount:200,discountAmount:0,shippingAmount:0,taxAmount:0,totalAmount:200,
    paymentStatus:"pending",fulfillmentStatus:"unfulfilled",inventoryPolicyVersion:1,inventoryReservationCount:count,
    createdAt:1,updatedAt:1,
  }));
}

test("schema-backed commit combines shared-owner quantities and replay changes no stock or timestamp",async()=>{
  const {t,ids}=await fixture();
  const orderId=await seedOrder(t,ids,2);
  const args={productId:ids.product,variantId:ids.variant,checkoutSessionId:ids.checkout,quantity:1};
  await t.mutation(internal.commerce.inventory.reserve,args);
  await t.mutation(internal.commerce.inventory.reserve,args);
  expect(await t.mutation(internal.commerce.inventory.commit,{checkoutSessionId:ids.checkout,orderId})).toEqual({success:true,committed:2});
  const before=await t.run(ctx=>ctx.db.get(orderId));
  expect(await t.mutation(internal.commerce.inventory.commit,{checkoutSessionId:ids.checkout,orderId})).toEqual({success:true,committed:0});
  await t.run(async ctx=>{
    expect((await ctx.db.get(orderId))?.inventoryCommittedAt).toBe(before?.inventoryCommittedAt);
    expect((await ctx.db.get(ids.product))?.stockQuantity).toBe(1);
    expect(await ctx.db.query("commerce_inventory_adjustments").withIndex("by_order",q=>q.eq("orderId",orderId)).take(10)).toHaveLength(2);
  });
});

test("nested reservation failure preserves a captured payment and purchase review state",async()=>{
  const {t,ids}=await fixture();
  const orderId=await seedOrder(t,ids,1);
  await t.mutation(internal.commerce.inventory.reserve,{productId:ids.product,variantId:ids.variant,checkoutSessionId:ids.checkout,quantity:2});
  const transactionId=await t.run(async ctx=>{
    await ctx.db.patch(ids.product,{stockQuantity:1});
    return ctx.db.insert("commerce_payment_transactions",{orderId,provider:"stripe",providerTransactionId:"pi_schema_stock_synthetic",status:"processing",amount:{amount:200,currencyCode:"USD"},createdAt:1,updatedAt:1});
  });
  const args={provider:"stripe",providerTransactionId:"pi_schema_stock_synthetic"};
  await t.mutation(internal.commerce.payments.confirmPaymentSuccess,args);
  await t.mutation(internal.commerce.payments.confirmPaymentSuccess,args);
  await t.run(async ctx=>{
    expect((await ctx.db.get(transactionId))?.status).toBe("succeeded");
    const order=await ctx.db.get(orderId);
    expect(order).toMatchObject({paymentStatus:"paid",fulfillmentStatus:"needs_review"});
    expect(order?.inventoryCommittedAt).toBeUndefined();
    expect((await ctx.db.get(ids.product))?.stockQuantity).toBe(1);
    expect(await ctx.db.query("commerce_inventory_adjustments").withIndex("by_order",q=>q.eq("orderId",orderId)).take(10)).toHaveLength(0);
    const history=await ctx.db.query("commerce_order_history").withIndex("by_order",q=>q.eq("orderId",orderId)).take(20);
    expect(history.filter(row=>row.eventType==="inventory_conflict")).toHaveLength(1);
    expect(history.filter(row=>row.eventType==="payment_received")).toHaveLength(1);
    expect(order?.purchaseOrderId).toBeDefined();
    const purchase=await ctx.db.get(order!.purchaseOrderId!);
    expect(purchase).toMatchObject({paymentStatus:"paid",fulfillmentStatus:"needs_review"});
  });
});

test("payment success commits its original holds once and synchronizes the paid purchase",async()=>{
  const {t,ids}=await fixture();
  const orderId=await seedOrder(t,ids,1);
  await t.mutation(internal.commerce.inventory.reserve,{productId:ids.product,variantId:ids.variant,checkoutSessionId:ids.checkout,quantity:2});
  await t.run(ctx=>ctx.db.insert("commerce_payment_transactions",{orderId,provider:"stripe",providerTransactionId:"pi_schema_stock_success",status:"processing",amount:{amount:200,currencyCode:"USD"},createdAt:1,updatedAt:1}));
  const args={provider:"stripe",providerTransactionId:"pi_schema_stock_success"};
  await t.mutation(internal.commerce.payments.confirmPaymentSuccess,args);
  await t.mutation(internal.commerce.payments.confirmPaymentSuccess,args);
  await t.run(async ctx=>{
    const order=await ctx.db.get(orderId);
    expect(order).toMatchObject({paymentStatus:"paid",fulfillmentStatus:"unfulfilled"});
    expect(order?.inventoryCommittedAt).toBeGreaterThan(0);
    expect((await ctx.db.get(ids.product))?.stockQuantity).toBe(1);
    expect(await ctx.db.query("commerce_inventory_adjustments").withIndex("by_order",q=>q.eq("orderId",orderId)).take(10)).toHaveLength(1);
    const purchase=await ctx.db.get(order!.purchaseOrderId!);
    expect(purchase).toMatchObject({paymentStatus:"paid",fulfillmentStatus:"unfulfilled"});
  });
});
