import {test,expect} from "bun:test";
import {resolveLabelOrigin,resolveShipStationLabelRate,upsLabelShipper,fedexLabelShipper} from "../labelOrigin";
import {createOrderShipmentFromLabel} from "../internals";
import {commerceHarness} from "../../commerce/__tests__/handlerHarness.test-support";
const origin={shipFromLocationId:"warehouse",name:"Booked warehouse",line1:"1 Booked Lane",city:"Denver",state:"CO",postalCode:"80202",countryCode:"US",phone:"3035550100"};
const globalSettings={shipFromName:"Current store",shipFromLine1:"9 Different Road",shipFromCity:"New York",shipFromState:"NY",shipFromPostalCode:"10001",shipFromCountryCode:"US"};
test("carrier shipper payloads use the immutable order origin despite changed global settings",()=>{
 const proof=resolveLabelOrigin({shipFromLocationId:"warehouse",shippingQuoteProof:{origin}},null,globalSettings);
 expect(proof.source).toBe("order_quote");
 expect(upsLabelShipper(proof.origin,"synthetic-account").Address).toMatchObject({AddressLine:["1 Booked Lane"],City:"Denver",PostalCode:"80202"});
 expect(fedexLabelShipper(proof.origin).address).toMatchObject({streetLines:["1 Booked Lane"],city:"Denver",postalCode:"80202"});
 expect(fedexLabelShipper(proof.origin).contact.phoneNumber).toBe("3035550100");
});
test("malformed or contradictory order proof never falls back to another origin",()=>{
 for(const bad of [null,{}, {...origin,line1:""},{...origin,phone:123}])expect(()=>resolveLabelOrigin({shippingQuoteProof:{origin:bad}},null,globalSettings)).toThrow("needs review");
 expect(()=>resolveLabelOrigin({shipFromLocationId:"different",shippingQuoteProof:{origin}},null,globalSettings)).toThrow("needs review");
});
test("legacy quote fallback requires matching provider, service and immutable order fingerprints",()=>{
 const order={shippingProvider:"ups",shippingServiceCode:"03",shippingQuoteAddressKey:"address",shippingQuoteCartKey:"cart"};
 const quote={origin,provider:"ups",serviceCode:"03",addressKey:"address",cartKey:"cart"};
 expect(resolveLabelOrigin(order,quote,globalSettings).source).toBe("matching_quote");
 expect(()=>resolveLabelOrigin(order,{...quote,cartKey:"changed"},globalSettings)).toThrow("needs review");
 expect(resolveLabelOrigin({},null,globalSettings)).toMatchObject({source:"legacy_configuration",origin:{line1:"9 Different Road"}});
});
test("shipment persistence retains the actual request origin and warehouse for manifests",async()=>{
 const ctx=commerceHarness({commerce_orders:[{_id:"order"}],commerce_order_items:[]});
 const originProof={origin,source:"order_quote"};
 const id=await (createOrderShipmentFromLabel as any)._handler(ctx,{orderId:"order",actorUserId:"admin",shipmentNumber:"synthetic-label",provider:"ups",status:"label_created",externalLabelId:"synthetic-external",items:[],originProof});
 expect(ctx.tables.commerce_shipments.find((row:any)=>row._id===id)).toMatchObject({shipFromLocationId:"warehouse",originProof});
});

test("creating a label does not erase an unresolved inventory review",async()=>{
 const ctx=commerceHarness({commerce_orders:[{_id:"order",fulfillmentStatus:"needs_review",status:"processing"}],commerce_order_items:[]});
 await (createOrderShipmentFromLabel as any)._handler(ctx,{orderId:"order",actorUserId:"admin",shipmentNumber:"synthetic-review",provider:"ups",status:"label_created",items:[]});
 expect(ctx.tables.commerce_orders[0].fulfillmentStatus).toBe("needs_review");
});

import {getEffectiveShipFrom} from "../helpers/settings";
import {convexTest} from "convex-test";
import schema from "../../schema";
import {internal} from "../../_generated/api";

test("label rate selection preserves the saved rate and refuses a different purchase",()=>{
 const order={shippingQuoteRaw:{rate_id:"saved-rate"},selectedShippingMethodCode:"shipstation:saved-rate",shippingQuoteProof:{origin}};
 expect(resolveShipStationLabelRate(order,null)).toBe("saved-rate");
 expect(resolveShipStationLabelRate(order,null,"saved-rate")).toBe("saved-rate");
 expect(()=>resolveShipStationLabelRate(order,null,"other-rate")).toThrow("Save the selected");
 expect(()=>resolveShipStationLabelRate({shippingQuoteProof:{origin}},null,"other-rate")).toThrow("Save the selected");
 expect(resolveShipStationLabelRate({},null,"legacy-explicit-rate")).toBe("legacy-explicit-rate");
 expect(()=>resolveShipStationLabelRate({},null)).toThrow("no saved carrier rate");
});

test("warehouse origin uses its address contacts without inheriting a different suite",async()=>{
 const ctx=commerceHarness();
 ctx.handlers["settings/httpInternals:getBySectionInternal"]=()=>({...globalSettings,shipFromLine2:"Suite from another address"});
 ctx.handlers["shipping/shipFromLocations/internals:getDefault"]=()=>({_id:"warehouse",name:"Warehouse",address:{line1:origin.line1,city:origin.city,state:origin.state,postalCode:origin.postalCode,countryCode:origin.countryCode,contactName:"Warehouse contact",companyName:"Warehouse company",phone:origin.phone}});
 const actual=await getEffectiveShipFrom(ctx);
 expect(actual).toMatchObject({shipFromLine1:origin.line1,shipFromLine2:"",shipFromName:"Warehouse contact",shipFromCompany:"Warehouse company",shipFromPhone:origin.phone,shipFromLocationId:"warehouse"});
 ctx.handlers["shipping/shipFromLocations/internals:getDefault"]=()=>{throw new Error("warehouse query unavailable");};
 await expect(getEffectiveShipFrom(ctx)).rejects.toThrow("warehouse query unavailable");
});

test("schema-backed shipment preserves the request origin and inventory review",async()=>{
 const t=convexTest({schema,modules:{
  "./convex/_generated/api.js":()=>import("../../_generated/api.js"),
  "./convex/_generated/server.js":()=>import("../../_generated/server.js"),
  "./convex/shipping/internals.ts":()=>import("../internals"),
 }});
 const ids=await t.run(async ctx=>{
  const actorUserId=await ctx.db.insert("users",{authSource:"local",email:"label@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  const shipFromLocationId=await ctx.db.insert("commerce_ship_from_locations",{name:"Label warehouse",code:"LABEL",locationType:"warehouse",address:{contactName:"Warehouse contact",line1:origin.line1,city:origin.city,state:origin.state,postalCode:origin.postalCode,countryCode:origin.countryCode,phone:origin.phone},isActive:true,isDefault:true,isArchived:false,timezone:"America/Denver",priority:1,createdAt:1,updatedAt:1});
  const orderId=await ctx.db.insert("commerce_orders",{orderNumber:"synthetic-label",trackingToken:"synthetic-label-token",status:"pending",currencyCode:"USD",email:"label@example.invalid",billingAddress:{firstName:"Test",lastName:"Customer",line1:"1 Destination St",city:"Denver",state:"CO",postalCode:"80202",countryCode:"US"},subtotalAmount:0,discountAmount:0,shippingAmount:0,taxAmount:0,totalAmount:0,paymentStatus:"pending",fulfillmentStatus:"needs_review",createdAt:1,updatedAt:1});
  return {actorUserId,orderId,shipFromLocationId};
 });
 const originProof={origin:{...origin,shipFromLocationId:ids.shipFromLocationId},source:"order_quote" as const};
 const shipmentId=await t.mutation(internal.shipping.internals.createOrderShipmentFromLabel,{orderId:ids.orderId,actorUserId:ids.actorUserId,shipmentNumber:"synthetic-schema-label",provider:"ups",status:"label_created",items:[],originProof});
 await t.run(async ctx=>{
  expect(await ctx.db.get(shipmentId)).toMatchObject({shipFromLocationId:ids.shipFromLocationId,originProof});
  expect(await ctx.db.get(ids.orderId)).toMatchObject({fulfillmentStatus:"needs_review"});
  const history=await ctx.db.query("commerce_order_history").withIndex("by_order",q=>q.eq("orderId",ids.orderId)).first();
  expect(history?.metadata).toMatchObject({shipmentId,originProof});
 });
});
