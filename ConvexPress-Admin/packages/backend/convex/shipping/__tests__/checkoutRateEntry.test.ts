import { expect, test } from "bun:test";
import { fetchCheckoutRates } from "../actions";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { COMMERCE_GENERAL_DEFAULTS } from "../../settings/defaults";

const address={line1:"1 Demo Lane",city:"Denver",state:"CO",postalCode:"80202",countryCode:"US"};
test("disabled live carriers still calculate configured zone shipping prices",async()=>{
 const ctx=commerceHarness();
 ctx.handlers["settings/httpInternals:getBySectionInternal"]=()=>({liveRatesEnabled:false});
 ctx.handlers["shipping/rates/pipeline:calculateRates"]=()=>({success:true,quotes:[{quoteKey:"flat:configured",amount:650,provider:"manual"}],matchedZone:{name:"United States"},fellBackToManual:false,stages:[]});
 const result=await (fetchCheckoutRates as any)._handler(ctx,{sessionToken:"session",shippingAddress:address});
 expect(result.quotes).toHaveLength(1);expect(result.quotes[0].amount).toBe(650);
 expect(ctx.calls.some(call=>call.name==="shipping/rates/pipeline:calculateRates")).toBe(true);
});
test("fresh stores do not advertise invented zero-price shipping methods",()=>{
 expect(COMMERCE_GENERAL_DEFAULTS.shippingMethods).toEqual([]);
});

import { calculateRates } from "../rates/pipeline";

test("real zone pipeline persists a $7 flat quote without contacting disabled carriers",async()=>{
 const ctx=commerceHarness();
 const rateContext={checkoutSession:{_id:"checkout"},cart:{subtotalAmount:3800,discountAmount:0,currencyCode:"USD"},items:[{_id:"line",productId:"mug",quantity:1,product:{shippingWeightOz:12}}]};
 ctx.handlers["settings/httpInternals:getBySectionInternal"]=()=>({liveRatesEnabled:false});
 ctx.handlers["shipping/rates/pipeline:calculateRates"]=calculateRates;
 ctx.handlers["shipping/internals:getRateContextForSession"]=()=>rateContext;
 ctx.handlers["shipping/rates/internals:getCachedQuotesForSession"]=()=>[];
 ctx.handlers["shipping/zones/internals:matchZoneForAddressInternal"]=()=>({zone:{_id:"utah",name:"Utah"},matchedFallback:false});
 ctx.handlers["shipping/rates/internals:listLiveRateZoneMethods"]=()=>[{provider:"ups"}];
 ctx.handlers["shipping/packages/internals:listAvailablePackages"]=()=>[];
 ctx.handlers["shipping/rates/internals:listEnabledMethodsForZone"]=()=>[{methodType:"flat_rate",config:{_id:"flat",zoneId:"utah",name:"utah-flat",label:"Utah delivery",baseCost:7,costMode:"per_order",enabled:true}}];
 const result=await (fetchCheckoutRates as any)._handler(ctx,{sessionToken:"session",shippingAddress:{...address,state:"UT"}});
 expect(result.quotes).toHaveLength(1);expect(result.quotes[0].amount).toBe(700);expect(result.quotes[0].provider).toBe("manual");
 const saved=ctx.calls.find(call=>call.name==="shipping/internals:replaceCheckoutQuotes");expect(saved?.args.quotes[0].amount).toBe(700);
 expect(ctx.calls.some(call=>call.name.includes("providers/ups")||call.name==="shipping/internals:getProviderSecret")).toBe(false);
});

import { updateSession } from "../../commerce/checkout";
import { computeAddressKey, computeCartKey } from "../../commerce/checkoutShippingGuards";
test("checkout charges a persisted configured quote and still honors free-shipping benefits",async()=>{
 for(const freeShippingByCoupon of [false,true]){
 const shippingAddress={...address,state:"UT"};
 const ctx=commerceHarness({
 settings:[{_id:"plugins",section:"plugins",values:{commerceEnabled:true}},{_id:"general",section:"commerce.general",values:{shippingEnabled:true,shippingMethods:[],currencyCode:"USD"}}],
 commerce_carts:[{_id:"cart",sessionToken:"session",status:"active",currencyCode:"USD"}],
 commerce_checkout_sessions:[{_id:"checkout",sessionToken:"session",cartId:"cart",status:"draft",currencyCode:"USD",subtotalAmount:3800,discountAmount:0,taxAmount:0,shippingAmount:0,shippingAddress,freeShippingByCoupon}],
 commerce_cart_items:[{_id:"line",cartId:"cart",productId:"mug",quantity:1,unitPriceAmount:3800,lineTotalAmount:3800}],
 commerce_products:[{_id:"mug",title:"Demo mug",isVirtual:false,basePrice:{amount:3800,currencyCode:"USD"}}],
 commerce_shipping_rate_quotes:[{_id:"quote",checkoutSessionId:"checkout",quoteKey:"flat:utah",provider:"manual",carrierCode:"flat_rate",carrierName:"Utah delivery",serviceCode:"utah-flat",serviceName:"Utah delivery",amount:700,currency:"USD",expiresAt:Date.now()+60000,addressKey:computeAddressKey(shippingAddress),cartKey:computeCartKey([{productId:"mug",quantity:1}])}],
 });
 await (updateSession as any)._handler(ctx,{sessionToken:"session",selectedShippingMethodCode:"flat:utah"});
 expect(ctx.tables.commerce_checkout_sessions[0].shippingAmount).toBe(freeShippingByCoupon?0:700);
 expect(ctx.tables.commerce_checkout_sessions[0].totalAmount).toBe(freeShippingByCoupon?3800:4500);
 }
});

import { getRateContextForSession, replaceCheckoutQuotes } from "../internals";
import { getCachedQuotesForSession } from "../rates/internals";
import { listCheckoutQuotes } from "../queries";

test("rate action persists an entered address and quotes remain listable and selectable across normalization",async()=>{
 const shippingAddress={line1:" 123 Example Test Lane ",city:"Salt Lake City",state:"ut",postalCode:"84101",countryCode:"us"};
 const ctx=commerceHarness({
 settings:[{_id:"plugins",section:"plugins",values:{commerceEnabled:true}},{_id:"general",section:"commerce.general",values:{shippingEnabled:true,shippingMethods:[],currencyCode:"USD"}}],
 commerce_carts:[{_id:"cart",sessionToken:"session",status:"active",subtotalAmount:3800,discountAmount:0,currencyCode:"USD"}],
 commerce_checkout_sessions:[{_id:"checkout",sessionToken:"session",cartId:"cart",status:"draft",currencyCode:"USD",subtotalAmount:3800,discountAmount:0,taxAmount:0,shippingAmount:0}],
 commerce_cart_items:[{_id:"line",cartId:"cart",productId:"mug",quantity:1,unitPriceAmount:3800,lineTotalAmount:3800}],
 commerce_products:[{_id:"mug",title:"Demo mug",isVirtual:false,shippingWeightOz:12,basePrice:{amount:3800,currencyCode:"USD"}}],
 });
 Object.assign(ctx.handlers,{
 "commerce/checkout:updateSession":updateSession,
 "shipping/rates/pipeline:calculateRates":calculateRates,
 "shipping/internals:getRateContextForSession":getRateContextForSession,
 "shipping/internals:replaceCheckoutQuotes":replaceCheckoutQuotes,
 "shipping/rates/internals:getCachedQuotesForSession":getCachedQuotesForSession,
 "settings/httpInternals:getBySectionInternal":()=>({liveRatesEnabled:false}),
 "shipping/zones/internals:matchZoneForAddressInternal":()=>({zone:{_id:"utah",name:"Utah"},matchedFallback:false}),
 "shipping/rates/internals:listLiveRateZoneMethods":()=>[],
 "shipping/packages/internals:listAvailablePackages":()=>[],
 "shipping/rates/internals:listEnabledMethodsForZone":()=>[{methodType:"flat_rate",config:{_id:"flat",zoneId:"utah",name:"utah-flat",label:"Utah delivery",baseCost:7,costMode:"per_order",enabled:true}}],
 });
 const rate=()=> (fetchCheckoutRates as any)._handler(ctx,{sessionToken:"session",shippingAddress});
 const list=()=> (listCheckoutQuotes as any)._handler(ctx,{sessionToken:"session"});
 await rate();
 const quotes=await list();expect(quotes).toHaveLength(1);
 expect(quotes[0].addressKey).toBe("123 EXAMPLE TEST LANE||SALT LAKE CITY|UT|84101|US");
 expect(quotes[0].cartKey).toBe("mug::1");
 const select=()=> (updateSession as any)._handler(ctx,{sessionToken:"session",selectedShippingMethodCode:quotes[0].quoteKey});
 await select();expect(ctx.tables.commerce_checkout_sessions[0].selectedShippingMethodLabel).toBe("Utah delivery");expect(ctx.tables.commerce_checkout_shipping_methods.find((method: any) => method.status === "active").label).toBe("Utah delivery");expect(ctx.tables.commerce_checkout_sessions[0].shippingAmount).toBe(700);expect(ctx.tables.commerce_checkout_sessions[0].totalAmount).toBe(4500);
 await (updateSession as any)._handler(ctx,{sessionToken:"session",shippingAddress:{...shippingAddress,line1:"123 EXAMPLE TEST LANE",state:"UT"}});
 expect(await list()).toHaveLength(1);await select();
 ctx.tables.commerce_cart_items[0].quantity=2;
 expect(await list()).toHaveLength(0);await expect(select()).rejects.toThrow();
 ctx.tables.commerce_cart_items[0].quantity=1;
 await (updateSession as any)._handler(ctx,{sessionToken:"session",shippingAddress:{...shippingAddress,line1:"456 Different Lane"}});
 expect(await list()).toHaveLength(0);await expect(select()).rejects.toThrow();
 await rate();expect(await list()).toHaveLength(1);
 ctx.tables.commerce_shipping_rate_quotes[0].expiresAt=Date.now()-1;
 expect(await list()).toHaveLength(0);await expect(select()).rejects.toThrow();
 const methods=ctx.handlers["shipping/rates/internals:listEnabledMethodsForZone"];
 ctx.handlers["shipping/rates/internals:listEnabledMethodsForZone"]=()=>{
   ctx.tables.commerce_cart_items[0].quantity=2;
   return methods();
 };
 await rate();
 expect(ctx.tables.commerce_shipping_rate_quotes[0].cartKey).toBe("mug::1");
 expect(await list()).toHaveLength(0);await expect(select()).rejects.toThrow();
});
