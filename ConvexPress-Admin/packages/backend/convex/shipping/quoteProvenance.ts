import { v, type Infer } from "convex/values";

export const shippingQuoteOriginValidator = v.object({
  shipFromLocationId:v.optional(v.id("commerce_ship_from_locations")),
  name:v.optional(v.string()),company:v.optional(v.string()),phone:v.optional(v.string()),
  line1:v.string(),line2:v.optional(v.string()),city:v.string(),state:v.optional(v.string()),
  postalCode:v.string(),countryCode:v.string(),
});
export const shippingQuotePackageValidator = v.object({
  weightOz:v.number(),lengthIn:v.optional(v.number()),widthIn:v.optional(v.number()),heightIn:v.optional(v.number()),
});
export type ShippingQuoteOrigin = Infer<typeof shippingQuoteOriginValidator>;
export type ShippingQuotePackage = Infer<typeof shippingQuotePackageValidator>;

export const persistedShippingQuoteValidator = v.object({
  quoteKey:v.string(),provider:v.string(),accountId:v.optional(v.id("shipping_provider_accounts")),
  carrierCode:v.string(),carrierName:v.string(),serviceCode:v.string(),serviceName:v.string(),
  amount:v.number(),currency:v.string(),estimatedDaysMin:v.optional(v.number()),estimatedDaysMax:v.optional(v.number()),
  deliveryDateEstimated:v.optional(v.number()),isCheapest:v.boolean(),isFastest:v.boolean(),isBestValue:v.boolean(),
  rawQuote:v.optional(v.any()),addressKey:v.optional(v.string()),cartKey:v.optional(v.string()),expiresAt:v.optional(v.number()),
  origin:v.optional(shippingQuoteOriginValidator),packages:v.optional(v.array(shippingQuotePackageValidator)),
});

/** Snapshot only address inputs used by the carrier; never copy credentials or integration settings. */
export function snapshotShippingOrigin(settings:{
  shipFromLocationId?:string|null;shipFromName?:string;shipFromCompany?:string;shipFromLine1?:string;shipFromLine2?:string;
  shipFromCity?:string;shipFromState?:string;shipFromPostalCode?:string;shipFromCountryCode?:string;shipFromPhone?:string;
}):ShippingQuoteOrigin {
  return {
    shipFromLocationId:(settings.shipFromLocationId ?? undefined) as ShippingQuoteOrigin["shipFromLocationId"],
    name:settings.shipFromName,company:settings.shipFromCompany,phone:settings.shipFromPhone,line1:settings.shipFromLine1??"",line2:settings.shipFromLine2,
    city:settings.shipFromCity??"",state:settings.shipFromState,postalCode:settings.shipFromPostalCode??"",countryCode:settings.shipFromCountryCode??"",
  };
}

export const publicShippingQuoteValidator = v.object({
  quoteKey:v.string(),provider:v.string(),carrierCode:v.string(),carrierName:v.string(),serviceCode:v.string(),serviceName:v.string(),
  amount:v.number(),currency:v.string(),estimatedDaysMin:v.optional(v.number()),estimatedDaysMax:v.optional(v.number()),
  deliveryDateEstimated:v.optional(v.number()),isCheapest:v.boolean(),isFastest:v.boolean(),isBestValue:v.boolean(),
  addressKey:v.optional(v.string()),cartKey:v.optional(v.string()),expiresAt:v.optional(v.number()),
});
export type PublicShippingQuote = Infer<typeof publicShippingQuoteValidator>;
export function publicShippingQuote(quote:Infer<typeof persistedShippingQuoteValidator>):PublicShippingQuote {
  const {quoteKey,provider,carrierCode,carrierName,serviceCode,serviceName,amount,currency,estimatedDaysMin,estimatedDaysMax,
    deliveryDateEstimated,isCheapest,isFastest,isBestValue,addressKey,cartKey,expiresAt}=quote;
  return {quoteKey,provider,carrierCode,carrierName,serviceCode,serviceName,amount,currency,estimatedDaysMin,estimatedDaysMax,
    deliveryDateEstimated,isCheapest,isFastest,isBestValue,addressKey,cartKey,expiresAt};
}
