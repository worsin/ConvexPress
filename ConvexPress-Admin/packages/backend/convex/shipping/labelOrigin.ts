import {ConvexError,v,type Infer} from "convex/values";
import {snapshotShippingOrigin,shippingQuoteOriginValidator,type ShippingQuoteOrigin} from "./quoteProvenance";

export const labelOriginProofValidator=v.object({
  origin:shippingQuoteOriginValidator,
  source:v.union(v.literal("order_quote"),v.literal("matching_quote"),v.literal("legacy_configuration")),
});
export type LabelOriginProof=Infer<typeof labelOriginProofValidator>;
type OrderOriginSource={
  shipFromLocationId?:string;
  shippingQuoteProof?:{origin?:unknown};
  shippingQuoteAddressKey?:string;
  shippingQuoteCartKey?:string;
  shippingProvider?:string;
  shippingServiceCode?:string;
};
type QuoteOriginSource={origin?:unknown;addressKey?:string;cartKey?:string;provider?:string;serviceCode?:string}|null|undefined;
const refuse=():never=>{throw new ConvexError({code:"SHIPPING_ORIGIN_REVIEW",message:"The saved shipping origin needs review before buying a label."});};
function validateOrigin(value:unknown):ShippingQuoteOrigin {
  if(!value || typeof value!=="object" || Array.isArray(value))return refuse();
  const row=value as Record<string,unknown>;
  for(const key of ["line1","city","postalCode","countryCode"])
    if(typeof row[key]!=="string" || !row[key].trim())return refuse();
  for(const key of ["shipFromLocationId","name","company","phone","line2","state"])
    if(row[key]!==undefined && typeof row[key]!=="string")return refuse();
  return {line1:row.line1 as string,city:row.city as string,postalCode:row.postalCode as string,countryCode:row.countryCode as string,
    line2:row.line2 as string|undefined,state:row.state as string|undefined,name:row.name as string|undefined,company:row.company as string|undefined,
    phone:row.phone as string|undefined,shipFromLocationId:row.shipFromLocationId as ShippingQuoteOrigin["shipFromLocationId"]};
}
export function resolveLabelOrigin(order:OrderOriginSource,quote:QuoteOriginSource,settings:Parameters<typeof snapshotShippingOrigin>[0]):LabelOriginProof {
  let proof:LabelOriginProof;
  if(order.shippingQuoteProof?.origin!==undefined){
    proof={origin:validateOrigin(order.shippingQuoteProof.origin),source:"order_quote"};
  }else if(quote?.origin!==undefined){
    if(!order.shippingQuoteAddressKey || !order.shippingQuoteCartKey || quote.addressKey!==order.shippingQuoteAddressKey ||
      quote.cartKey!==order.shippingQuoteCartKey || quote.provider!==order.shippingProvider || quote.serviceCode!==order.shippingServiceCode)return refuse();
    proof={origin:validateOrigin(quote.origin),source:"matching_quote"};
  }else{
    // Legacy orders have no historic origin evidence. Preserve the explicit
    // configured-label workflow and record exactly which source was used.
    proof={origin:validateOrigin(snapshotShippingOrigin(settings)),source:"legacy_configuration"};
  }
  if(order.shipFromLocationId && proof.origin.shipFromLocationId!==order.shipFromLocationId)return refuse();
  return proof;
}
export function upsLabelShipper(origin:ShippingQuoteOrigin,accountNumber:string){
  return {Name:origin.name||origin.company||"Store",ShipperNumber:accountNumber,Address:{
    AddressLine:[origin.line1,origin.line2].filter(Boolean),City:origin.city,StateProvinceCode:origin.state||undefined,
    PostalCode:origin.postalCode,CountryCode:origin.countryCode,
  }};
}
export function fedexLabelShipper(origin:ShippingQuoteOrigin,fallbackPhone?:string){
  return {contact:{personName:origin.name||origin.company||"Store",phoneNumber:origin.phone||fallbackPhone||"0000000000"},
    address:{streetLines:[origin.line1,origin.line2].filter(Boolean),city:origin.city,stateOrProvinceCode:origin.state||undefined,postalCode:origin.postalCode,countryCode:origin.countryCode}};
}


/** A new rate must be saved on the order before its label is purchased. */
export function resolveShipStationLabelRate(order:{shippingQuoteRaw?:unknown;selectedShippingMethodCode?:string;shippingQuoteProof?:{origin?:unknown}},quote:{rawQuote?:unknown}|null|undefined,requested?:string):string {
  const rawId=(value:unknown):string|undefined=>value && typeof value==="object" && "rate_id" in value && typeof value.rate_id==="string" ? value.rate_id : undefined;
  const key=order.selectedShippingMethodCode;
  const recorded=rawId(order.shippingQuoteRaw)??rawId(quote?.rawQuote)??(key?.startsWith("shipstation:")?key.slice("shipstation:".length):key);
  if(requested && ((recorded && requested!==recorded)||(!recorded && order.shippingQuoteProof?.origin!==undefined))) {
    throw new ConvexError({code:"SHIPPING_RATE_REVIEW",message:"Save the selected shipping rate on the order before buying its label."});
  }
  const rateId=recorded??requested;
  if(!rateId?.trim())throw new ConvexError({code:"SHIPPING_RATE_REVIEW",message:"The order has no saved carrier rate for label purchase."});
  return rateId;
}
