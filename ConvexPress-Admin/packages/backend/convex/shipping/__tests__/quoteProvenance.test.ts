import {test,expect} from "bun:test";
import {replaceCheckoutQuotes} from "../internals";
import {commerceHarness} from "../../commerce/__tests__/handlerHarness.test-support";
const call=(fn:any,ctx:any,args:any)=>fn._handler(ctx,args);
const origin={shipFromLocationId:"warehouse",name:"Synthetic warehouse",line1:"123 Origin St",city:"Denver",state:"CO",postalCode:"80202",countryCode:"US"};
const quote={quoteKey:"ups:ground",provider:"ups",accountId:"account",carrierCode:"ups",carrierName:"UPS",serviceCode:"03",serviceName:"Ground",amount:700,currency:"USD",isCheapest:true,isFastest:false,isBestValue:true,expiresAt:Date.now()+60000,origin,packages:[{weightOz:24,lengthIn:10,widthIn:8,heightIn:4}]};
test("quote persistence retains the actual origin, packages and carrier account",async()=>{
 const ctx=commerceHarness();
 await call(replaceCheckoutQuotes,ctx,{checkoutSessionId:"checkout",quotes:[quote],addressKey:"destination",cartKey:"cart"});
 expect(ctx.tables.commerce_shipping_rate_quotes[0]).toMatchObject({origin,packages:quote.packages,accountId:"account",addressKey:"destination",cartKey:"cart"});
});
test("invalid quote amounts refuse replacement before deleting existing quotes",async()=>{
 for(const amount of [-1,NaN,Infinity,1.5]){
  const ctx=commerceHarness({commerce_shipping_rate_quotes:[{_id:"existing",checkoutSessionId:"checkout",quoteKey:"previous"}]});
  await expect(call(replaceCheckoutQuotes,ctx,{checkoutSessionId:"checkout",quotes:[{...quote,amount}]})).rejects.toThrow();
  expect(ctx.tables.commerce_shipping_rate_quotes.map((row:any)=>row._id)).toEqual(["existing"]);
 }
});

import {snapshotShippingOrigin,publicShippingQuote} from "../quoteProvenance";
import {fetchCheckoutRates} from "../actions";
import {convexTest} from "convex-test";
import schema from "../../schema";
import {api,internal} from "../../_generated/api";

test("origin snapshots and public quote projections never copy integration secrets",()=>{
 const settings={shipFromLine1:"123 Origin St",shipFromCity:"Denver",shipFromPostalCode:"80202",shipFromCountryCode:"US",apiKey:"synthetic-secret"};
 const snapshot=snapshotShippingOrigin(settings);settings.shipFromCity="Changed later";
 expect(snapshot.city).toBe("Denver");expect(JSON.stringify(snapshot)).not.toContain("synthetic-secret");
 const shown=publicShippingQuote({...quote,rawQuote:{accountNumber:"private-account"}} as any);
 for(const field of ["origin","packages","accountId","rawQuote"])expect(shown).not.toHaveProperty(field);
 expect(shown).toMatchObject({quoteKey:"ups:ground",amount:700,carrierName:"UPS"});
});

test("public rate action omits warehouse and internal diagnostic payloads",async()=>{
 const ctx=commerceHarness();
 ctx.handlers["shipping/rates/pipeline:calculateRates"]=()=>({success:true,quotes:[{...quote,rawQuote:{private:"carrier-raw"}}],matchedZone:{_id:"zone",name:"US",privateRule:"private-zone"},fellBackToManual:false,stages:[{stage:"provider",detail:"private-diagnostic"}]});
 const result=await call(fetchCheckoutRates,ctx,{sessionToken:"session",shippingAddress:{line1:"1 Destination St",city:"Denver",postalCode:"80202",countryCode:"US"}});
 expect(result.quotes[0]).not.toHaveProperty("origin");expect(result.quotes[0]).not.toHaveProperty("rawQuote");
 expect(result.matchedZone).toEqual({_id:"zone",name:"US"});expect(result.stages).toEqual([]);
 expect(JSON.stringify(result)).not.toContain("private-");
});

test("schema-backed quote replacement retains provenance while the public query returns display fields",async()=>{
 const t=convexTest({schema,modules:{
  "./convex/_generated/api.js":()=>import("../../_generated/api.js"),
  "./convex/_generated/server.js":()=>import("../../_generated/server.js"),
  "./convex/shipping/internals.ts":()=>import("../internals"),
  "./convex/shipping/queries.ts":()=>import("../queries"),
 }});
 const checkoutSessionId=await t.run(async ctx=>{
  const user=await ctx.db.insert("users",{authSource:"local",email:"quote@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  await ctx.db.insert("settings",{section:"plugins",values:{commerceEnabled:true},updatedAt:1,updatedBy:user});
  const cartId=await ctx.db.insert("commerce_carts",{sessionToken:"quote-test",status:"active",currencyCode:"USD",subtotalAmount:0,discountAmount:0,shippingAmount:0,taxAmount:0,totalAmount:0,itemCount:0,lastActiveAt:1,createdAt:1,updatedAt:1});
  return ctx.db.insert("commerce_checkout_sessions",{cartId,sessionToken:"quote-test",status:"draft",currencyCode:"USD",subtotalAmount:0,discountAmount:0,shippingAmount:0,taxAmount:0,totalAmount:0,createdAt:1,updatedAt:1});
 });
 const {accountId,...withoutAccount}=quote;const {shipFromLocationId,...addressOrigin}=origin;
 const storedQuote={...withoutAccount,origin:addressOrigin,rawQuote:{accountNumber:"synthetic-private-account"}};
 await t.mutation(internal.shipping.internals.replaceCheckoutQuotes,{checkoutSessionId,quotes:[storedQuote]});
 await t.run(async ctx=>{
  const stored=await ctx.db.query("commerce_shipping_rate_quotes").withIndex("by_checkout",q=>q.eq("checkoutSessionId",checkoutSessionId)).unique();
  expect(stored).toMatchObject({origin:addressOrigin,packages:quote.packages,rawQuote:{accountNumber:"synthetic-private-account"}});
 });
 const shown=await t.query(api.shipping.queries.listCheckoutQuotes,{sessionToken:"quote-test"});
 expect(shown).toHaveLength(1);expect(shown[0]).toMatchObject({quoteKey:"ups:ground",amount:700});
 for(const field of ["origin","packages","accountId","rawQuote"])expect(shown[0]).not.toHaveProperty(field);
});
