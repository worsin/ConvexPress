import {test,expect} from "bun:test";
import {computeAddressKey,computeCartKey} from "../checkoutShippingGuards";
import {confirmPaymentSuccess} from "../payments";
import {complete} from "../checkout";
import {restoreRecordedOrderStock} from "../stockLedger";
import {addItem} from "../cart";
import {getAvailable,canFulfill,listLocationLevels,reserve,commit,release,releaseExpiredReservations,adjust,upsertLocationLevel} from "../inventory";
import {commerceHarness} from "./handlerHarness.test-support";
const call=(fn:any,ctx:any,args:any)=>fn._handler(ctx,args);
function fixture(product:any={},variant:any={}){return commerceHarness({
  commerce_products:[{_id:"p",title:"Fixture",slug:"fixture",status:"publish",productType:"variable",basePrice:{amount:2500,currencyCode:"USD"},trackInventory:true,stockQuantity:10,allowBackorders:false,...product}],
  commerce_product_variants:[{_id:"v",productId:"p",title:"Blue",price:{amount:2500,currencyCode:"USD"},status:"publish",isDefault:true,manageStock:"parent",stockQuantity:2,...variant}],
  commerce_orders:[{_id:"order"}],commerce_stock_reservations:[],commerce_checkout_sessions:[{_id:"checkout",status:"ready_for_review"}],
},"admin");}
const cases=[
  {label:"explicit yes ignores parent tracking off",product:{trackInventory:false},variant:{manageStock:"yes"},quantity:3,allowed:false,owner:"v"},
  {label:"explicit no ignores parent stock zero",product:{stockQuantity:0},variant:{manageStock:"no"},quantity:3,allowed:true,owner:null},
  {label:"explicit no respects manual out of stock",product:{stockQuantity:100},variant:{manageStock:"no",stockStatus:"outofstock"},quantity:1,allowed:false,owner:null},
  {label:"parent inherits backorders",product:{stockQuantity:0,allowBackorders:true},variant:{manageStock:"parent",backorders:"no"},quantity:3,allowed:true,owner:"p"},
  {label:"variant backorders keep quantity tracking",product:{trackInventory:false},variant:{manageStock:"yes",stockQuantity:0,backorders:"notify"},quantity:3,allowed:true,owner:"v"},
];
for(const c of cases)test(`cart and inventory agree: ${c.label}`,async()=>{
  const ctx=fixture(c.product,c.variant);
  const cart=call(addItem,ctx,{sessionToken:"stock-case",productId:"p",variantId:"v",quantity:c.quantity});
  if(c.allowed)await cart;else await expect(cart).rejects.toThrow();
  const answer=await call(canFulfill,ctx,{items:[{productId:"p",variantId:"v",quantity:c.quantity}]});expect(answer.canFulfillAll).toBe(c.allowed);
  const attempt=call(reserve,ctx,{productId:"p",variantId:"v",checkoutSessionId:"checkout",quantity:c.quantity});
  if(!c.allowed){await expect(attempt).rejects.toThrow();return;}
  const result=await attempt;
  if(c.owner===null){expect(result.skipped).toBe(true);expect(ctx.tables.commerce_stock_reservations).toHaveLength(0);return;}
  const row=ctx.tables.commerce_stock_reservations[0];expect(row.variantId).toBe(c.owner==="v"?"v":undefined);
  const before=(c.owner==="v"?ctx.tables.commerce_product_variants[0]:ctx.tables.commerce_products[0]).stockQuantity;
  await call(commit,ctx,{checkoutSessionId:"checkout",orderId:"order"});
  expect((c.owner==="v"?ctx.tables.commerce_product_variants[0]:ctx.tables.commerce_products[0]).stockQuantity).toBe(before-c.quantity);
  await call(commit,ctx,{checkoutSessionId:"checkout",orderId:"order"});expect(ctx.tables.commerce_inventory_adjustments.filter((x:any)=>x.adjustmentType==="sale")).toHaveLength(1);
});
test("a parent reservation is shared by sibling variants and retains its owner after settings change",async()=>{
  const ctx=fixture({stockQuantity:2});ctx.tables.commerce_product_variants.push({...ctx.tables.commerce_product_variants[0],_id:"sibling"});
  await call(reserve,ctx,{productId:"p",variantId:"v",checkoutSessionId:"checkout",quantity:2});
  expect((await call(getAvailable,ctx,{productId:"p",variantId:"sibling"})).available).toBe(0);
  await expect(call(addItem,ctx,{sessionToken:"sibling-cart",productId:"p",variantId:"sibling",quantity:1})).rejects.toThrow();
  ctx.tables.commerce_product_variants[0].manageStock="yes";ctx.tables.commerce_products[0].trackInventory=false;
  await call(commit,ctx,{checkoutSessionId:"checkout",orderId:"order"});
  expect(ctx.tables.commerce_products[0].stockQuantity).toBe(0);expect(ctx.tables.commerce_product_variants[0].stockQuantity).toBe(2);
});
test("expired reservations do not conceal available stock while cleanup catches up",async()=>{
  const ctx=fixture({stockQuantity:3});ctx.tables.commerce_stock_reservations.push({_id:"expired",productId:"p",status:"active",quantity:3,expiresAt:Date.now()-1});
  expect((await call(getAvailable,ctx,{productId:"p",variantId:"v"})).available).toBe(3);
});
function checkout(ctx:any,quantity=1){
 const address={firstName:"Synthetic",lastName:"Customer",line1:"123 Test St",city:"Denver",state:"CO",postalCode:"80202",countryCode:"US"};
 ctx.tables.settings.push({_id:"general",section:"commerce.general",values:{shippingEnabled:false,allowGuestCheckout:true,paymentMethods:[{code:"card",label:"Card",enabled:true}],currencyCode:"USD"}});
 ctx.tables.commerce_carts=[{_id:"cart",sessionToken:"stock-checkout",status:"active",currencyCode:"USD",subtotalAmount:2500*quantity,discountAmount:0,shippingAmount:0}];
 ctx.tables.commerce_cart_items=[{_id:"line",cartId:"cart",productId:"p",variantId:"v",quantity,unitPriceAmount:2500,lineTotalAmount:2500*quantity}];
 ctx.tables.commerce_checkout_sessions=[{_id:"checkout",cartId:"cart",sessionToken:"stock-checkout",status:"ready_for_review",email:"synthetic@example.invalid",billingAddress:address,selectedPaymentMethodCode:"card",currencyCode:"USD",subtotalAmount:2500*quantity,discountAmount:0,shippingAmount:0}];
 return ctx;
}
for(const c of cases.filter(c=>c.allowed))test(`checkout, commitment and restoration agree: ${c.label}`,async()=>{
 const ctx=checkout(fixture(c.product,c.variant),c.quantity);
 const orderId=await call(complete,ctx,{sessionToken:"stock-checkout"});
 const reservations=ctx.tables.commerce_stock_reservations;
 expect(reservations).toHaveLength(c.owner?1:0);
 if(c.owner)expect(reservations[0].variantId).toBe(c.owner==="v"?"v":undefined);
 const beforeParent=ctx.tables.commerce_products[0].stockQuantity,beforeVariant=ctx.tables.commerce_product_variants[0].stockQuantity;
 await call(commit,ctx,{checkoutSessionId:"checkout",orderId});
 expect(ctx.tables.commerce_products[0].stockQuantity).toBe(beforeParent-(c.owner==="p"?c.quantity:0));
 expect(ctx.tables.commerce_product_variants[0].stockQuantity).toBe(beforeVariant-(c.owner==="v"?c.quantity:0));
 const order=ctx.tables.commerce_orders.find((o:any)=>o._id===orderId);
 // A later editor change must not redirect a return or invent stock for an untracked order.
 ctx.tables.commerce_products[0].trackInventory=true;ctx.tables.commerce_product_variants[0].manageStock=c.owner==="p"?"yes":"parent";
 expect(await restoreRecordedOrderStock(ctx,order)).toBe(true);
 expect(ctx.tables.commerce_products[0].stockQuantity).toBe(beforeParent);expect(ctx.tables.commerce_product_variants[0].stockQuantity).toBe(beforeVariant);
 await restoreRecordedOrderStock(ctx,order);
 expect(ctx.tables.commerce_products[0].stockQuantity).toBe(beforeParent);expect(ctx.tables.commerce_product_variants[0].stockQuantity).toBe(beforeVariant);
});
test("variant-owned inventory cannot borrow parent location stock",async()=>{
 const ctx=checkout(fixture({stockQuantity:100},{manageStock:"yes",stockQuantity:0}));
 ctx.tables.commerce_inventory_levels=[{_id:"level",productId:"p",locationId:"warehouse",stockQuantity:100,isActive:true}];
 await expect(call(complete,ctx,{sessionToken:"stock-checkout"})).rejects.toThrow("Only 0 available");
});
test("insufficient location inventory cannot fall back to a contradictory aggregate stock count",async()=>{
 const ctx=checkout(fixture({stockQuantity:100},{manageStock:"parent"}));
 ctx.tables.commerce_inventory_levels=[{_id:"level",productId:"p",locationId:"warehouse",stockQuantity:0,isActive:true}];
 await expect(call(complete,ctx,{sessionToken:"stock-checkout"})).rejects.toThrow("Only 0 available");
});
test("anonymous callers cannot inspect warehouse details or unpublished product inventory",async()=>{
 const ctx=fixture({status:"draft"});ctx.auth.getUserIdentity=async()=>null;
 for(const fn of [getAvailable,listLocationLevels])await expect(call(fn,ctx,{productId:"p",variantId:"v"})).rejects.toThrow();
 await expect(call(canFulfill,ctx,{items:[{productId:"p",variantId:"v",quantity:1}]})).rejects.toThrow();
});
test("a vanished physical location never redirects a reservation to aggregate inventory",async()=>{
 const ctx=fixture();
 await expect(call(reserve,ctx,{productId:"p",variantId:"v",locationId:"missing",quantity:1,checkoutSessionId:"checkout"})).rejects.toThrow();
 ctx.tables.commerce_inventory_levels=[{_id:"level",productId:"p",locationId:"warehouse",stockQuantity:10,isActive:true}];
 await call(reserve,ctx,{productId:"p",variantId:"v",locationId:"warehouse",quantity:1,checkoutSessionId:"checkout"});
 ctx.tables.commerce_inventory_levels=[];
 await expect(call(commit,ctx,{checkoutSessionId:"checkout",orderId:"order"})).rejects.toThrow();
 expect(ctx.tables.commerce_products[0].stockQuantity).toBe(10);expect(ctx.tables.commerce_stock_reservations[0].status).toBe("active");
});


test("checkout cancellation releases every hold even after its recorded stock target is removed", async () => {
  const ctx = fixture();
  const now = Date.now();
  ctx.tables.commerce_stock_reservations = [
    {_id:"a", checkoutSessionId:"checkout", productId:"p", quantity:2, status:"active", expiresAt:now+60000},
    {_id:"b", checkoutSessionId:"checkout", productId:"deleted", variantId:"deleted-variant", locationId:"warehouse", quantity:3, status:"active", expiresAt:now+60000},
    {_id:"other", checkoutSessionId:"other-checkout", productId:"p", quantity:7, status:"active", expiresAt:now+60000},
  ];
  expect(await call(release, ctx, {checkoutSessionId:"checkout"})).toEqual({success:true, released:5});
  expect(ctx.tables.commerce_stock_reservations.map((row:any)=>row.status)).toEqual(["released","released","active"]);
  expect(ctx.tables.commerce_inventory_adjustments).toHaveLength(2);
  expect(ctx.tables.commerce_inventory_adjustments[1]).toMatchObject({productId:"deleted",variantId:"deleted-variant",locationId:"warehouse"});
  expect((await call(release, ctx, {checkoutSessionId:"checkout"})).success).toBe(false);
  expect(ctx.tables.commerce_inventory_adjustments).toHaveLength(2);
  expect(ctx.tables.commerce_products[0].stockQuantity).toBe(10);
});

test("reservation-specific release verifies the supplied checkout identity", async () => {
  const ctx = fixture();
  await call(reserve, ctx, {productId:"p",variantId:"v",checkoutSessionId:"checkout",quantity:1});
  const reservationId = ctx.tables.commerce_stock_reservations[0]._id;
  await expect(call(release, ctx, {reservationId,checkoutSessionId:"other-checkout"})).rejects.toThrow();
  expect(ctx.tables.commerce_stock_reservations[0].status).toBe("active");
  expect((await call(release, ctx, {reservationId})).released).toBe(1);
});

test("expiry drains an indexed bounded batch and schedules the remaining holds", async () => {
  const ctx = fixture();
  const now = Date.now();
  ctx.tables.commerce_stock_reservations = Array.from({length:102}, (_,i)=>({_id:`expiry-${i}`,checkoutSessionId:"checkout",productId:"p",locationId:"warehouse",status:"active",quantity:1,expiresAt:now-1000}));
  ctx.tables.commerce_stock_reservations.push({_id:"future",checkoutSessionId:"checkout",productId:"p",status:"active",quantity:1,expiresAt:now+60000});
  const query = ctx.db.query;
  ctx.db.query = (table:string) => {
    const builder = query(table);
    if(table === "commerce_stock_reservations") {
      const indexed = builder.withIndex;
      builder.withIndex = (name:string, cb:any) => {expect(name).toBe("by_status_expiry");return indexed(name,cb);};
      builder.filter = () => {throw new Error("Expiration must not scan the reservation table");};
      const take = builder.take;
      builder.take = (n:number) => {expect(n).toBe(101);return take(n);};
    }
    return builder;
  };
  expect(await call(releaseExpiredReservations,ctx,{})).toEqual({released:100});
  expect(ctx.calls.filter((c:any)=>c.name==="commerce/inventory:releaseExpiredReservations")).toHaveLength(1);
  expect(ctx.tables.commerce_inventory_adjustments.every((row:any)=>row.locationId==="warehouse")).toBe(true);
  expect(await call(releaseExpiredReservations,ctx,{})).toEqual({released:2});
  expect(ctx.tables.commerce_stock_reservations.filter((row:any)=>row.status==="active").map((row:any)=>row._id)).toEqual(["future"]);
  expect(ctx.tables.commerce_products[0].stockQuantity).toBe(10);
});

test("adjusting untracked variant stock uses its own quantity", async () => {
  const ctx = fixture({stockQuantity:100},{manageStock:"no",stockQuantity:2});
  await call(adjust,ctx,{productId:"p",variantId:"v",adjustmentType:"correction",quantity:1,reason:"Synthetic stock correction"});
  expect(ctx.tables.commerce_product_variants[0].stockQuantity).toBe(3);
  expect(ctx.tables.commerce_products[0].stockQuantity).toBe(100);
});


test("fulfillment evaluates sibling lines against their shared parent stock", async () => {
  const ctx = fixture({stockQuantity:3});
  ctx.tables.commerce_product_variants.push({...ctx.tables.commerce_product_variants[0],_id:"sibling"});
  const result = await call(canFulfill,ctx,{items:[{productId:"p",variantId:"v",quantity:2},{productId:"p",variantId:"sibling",quantity:2}]});
  expect(result.canFulfillAll).toBe(false);
  expect(result.items[0].canFulfill).toBe(true);
  expect(result.items[1]).toMatchObject({canFulfill:false,available:1});
  expect(ctx.tables.commerce_stock_reservations).toHaveLength(0);
});

test("parent-owned inventory edits preserve the physical owner in quantity and audit", async () => {
  const ctx = fixture({stockQuantity:3});
  await call(adjust,ctx,{productId:"p",variantId:"v",adjustmentType:"restock",quantity:1,reason:"Synthetic restock"});
  expect(ctx.tables.commerce_products[0].stockQuantity).toBe(4);
  expect(ctx.tables.commerce_inventory_adjustments[0].variantId).toBeUndefined();
  // The inventory list exposes a single parent entry, without a selected variant.
  await call(adjust,ctx,{productId:"p",adjustmentType:"restock",quantity:1,reason:"Synthetic parent entry"});
  expect(ctx.tables.commerce_products[0].stockQuantity).toBe(5);
  expect(ctx.tables.commerce_product_variants[0].stockQuantity).toBe(2);
});

test("parent-mode warehouse edits address parent stock rather than inventing variant levels", async () => {
  const ctx = fixture();
  ctx.tables.commerce_ship_from_locations = [{_id:"warehouse",name:"Synthetic warehouse"}];
  ctx.tables.commerce_inventory_levels = [{_id:"level",productId:"p",locationId:"warehouse",stockQuantity:4}];
  await call(upsertLocationLevel,ctx,{productId:"p",variantId:"v",locationId:"warehouse",stockQuantity:5});
  expect(ctx.tables.commerce_inventory_levels).toHaveLength(1);
  expect(ctx.tables.commerce_inventory_levels[0]).toMatchObject({_id:"level",stockQuantity:5});
  await call(adjust,ctx,{productId:"p",variantId:"v",locationId:"warehouse",adjustmentType:"restock",quantity:1,reason:"Synthetic warehouse restock"});
  expect(ctx.tables.commerce_inventory_levels[0].stockQuantity).toBe(6);
  expect(ctx.tables.commerce_inventory_adjustments[0]).toMatchObject({locationId:"warehouse",quantityDelta:1});
  expect(ctx.tables.commerce_inventory_adjustments[0].variantId).toBeUndefined();
  expect(ctx.tables.commerce_products[0].stockQuantity).toBe(10);
});


for (const problem of ["expired", "stock-changed", "hold-removed"] as const) test(`paid inventory conflict preserves payment and refuses fallback: ${problem}`, async () => {
  const ctx = checkout(fixture({stockQuantity:3}),2);
  ctx.handlers["commerce/inventory:commit"] = commit;
  const orderId = await call(complete,ctx,{sessionToken:"stock-checkout"});
  const order = ctx.tables.commerce_orders.find((row:any)=>row._id===orderId);
  ctx.tables.commerce_payment_transactions = [{_id:"txn",orderId,provider:"stripe",providerTransactionId:"pi_stock_synthetic",status:"processing",amount:{amount:5000,currencyCode:"USD"}}];
  if(problem === "expired")ctx.tables.commerce_stock_reservations[0].expiresAt=Date.now()-1;
  if(problem === "stock-changed")ctx.tables.commerce_products[0].stockQuantity=1;
  if(problem === "hold-removed")ctx.tables.commerce_stock_reservations=[];
  const stockBefore=ctx.tables.commerce_products[0].stockQuantity;
  await call(confirmPaymentSuccess,ctx,{provider:"stripe",providerTransactionId:"pi_stock_synthetic"});
  expect(ctx.tables.commerce_payment_transactions[0].status).toBe("succeeded");
  expect(order).toMatchObject({paymentStatus:"paid",fulfillmentStatus:"needs_review"});
  expect(order.inventoryCommittedAt).toBeUndefined();
  expect(ctx.tables.commerce_products[0].stockQuantity).toBe(stockBefore);
  expect(ctx.tables.commerce_inventory_adjustments?.filter((row:any)=>row.adjustmentType==="sale")??[]).toHaveLength(0);
  await call(confirmPaymentSuccess,ctx,{provider:"stripe",providerTransactionId:"pi_stock_synthetic"});
  expect(ctx.tables.commerce_order_history.filter((row:any)=>row.eventType==="inventory_conflict")).toHaveLength(1);
});

test("commit validates every reservation before changing the first stock owner", async () => {
  const ctx=fixture({stockQuantity:3},{manageStock:"yes",stockQuantity:3});
  ctx.tables.commerce_product_variants.push({...ctx.tables.commerce_product_variants[0],_id:"second"});
  for(const variantId of ["v","second"])await call(reserve,ctx,{productId:"p",variantId,checkoutSessionId:"checkout",quantity:2});
  ctx.tables.commerce_product_variants[1].stockQuantity=0;
  await expect(call(commit,ctx,{checkoutSessionId:"checkout",orderId:"order"})).rejects.toThrow();
  expect(ctx.tables.commerce_product_variants[0].stockQuantity).toBe(3);
  expect(ctx.tables.commerce_stock_reservations.every((row:any)=>row.status==="active")).toBe(true);
});

test("backorder permission is captured with the hold instead of reread after policy changes", async () => {
  const ctx=fixture({stockQuantity:0,allowBackorders:true});
  await call(reserve,ctx,{productId:"p",variantId:"v",checkoutSessionId:"checkout",quantity:2});
  expect(ctx.tables.commerce_stock_reservations[0].allowBackorders).toBe(true);
  ctx.tables.commerce_products[0].allowBackorders=false;
  await call(commit,ctx,{checkoutSessionId:"checkout",orderId:"order"});
  expect(ctx.tables.commerce_products[0].stockQuantity).toBe(-2);
});


function warehouseCheckout(quantity:number){
  const ctx=checkout(fixture({stockQuantity:100,isVirtual:false}),quantity);
  ctx.tables.settings.find((row:any)=>row.section==="commerce.general").values.shippingEnabled=true;
  const session=ctx.tables.commerce_checkout_sessions[0];session.shippingAddress={...session.billingAddress};
  const origin={shipFromLocationId:"quoted-warehouse",line1:"1 Origin Lane",city:"Denver",state:"CO",postalCode:"80202",countryCode:"US"};
  ctx.tables.commerce_ship_from_locations=[{_id:"quoted-warehouse",isActive:true,isArchived:false,address:{...origin}}];
  ctx.tables.commerce_inventory_levels=[{_id:"quoted-level",productId:"p",locationId:"quoted-warehouse",stockQuantity:1,isActive:true},{_id:"other-level",productId:"p",locationId:"other-warehouse",stockQuantity:10,isActive:true}];
  ctx.tables.commerce_checkout_shipping_methods=[{_id:"method",checkoutSessionId:"checkout",cartId:"cart",status:"active",source:"live_quote",code:"ups:ground",quoteKey:"ups:ground",label:"Ground",amount:700,currencyCode:"USD",provider:"ups",origin,addressKey:computeAddressKey(session.shippingAddress),cartKey:computeCartKey(ctx.tables.commerce_cart_items),expiresAt:Date.now()+60000}];
  session.selectedShippingMethodCode="ups:ground";
  return ctx;
}
test("checkout reserves stock from the quoted warehouse and snapshots that origin on the order",async()=>{
 const ctx=warehouseCheckout(1);
 const orderId=await call(complete,ctx,{sessionToken:"stock-checkout"});
 expect(ctx.tables.commerce_stock_reservations[0].locationId).toBe("quoted-warehouse");
 expect(ctx.tables.commerce_orders.find((row:any)=>row._id===orderId).shipFromLocationId).toBe("quoted-warehouse");
});
test("a cheaper quoted origin cannot borrow stock from a different warehouse",async()=>{
 const ctx=warehouseCheckout(2);
 await expect(call(complete,ctx,{sessionToken:"stock-checkout"})).rejects.toThrow("stock");
 expect(ctx.tables.commerce_orders).toHaveLength(1);
});
test("warehouse address changes invalidate a shipping quote before stock reservation",async()=>{
 const ctx=warehouseCheckout(1);ctx.tables.commerce_ship_from_locations[0].address.postalCode="10001";
 await expect(call(complete,ctx,{sessionToken:"stock-checkout"})).rejects.toThrow("refresh shipping rates");
 expect(ctx.tables.commerce_stock_reservations).toHaveLength(0);
});
