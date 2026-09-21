import {v,type Validator} from "convex/values";
import type {RegisteredQuery} from "convex/server";
import {query} from "../_generated/server";
import {readLeadMagnetSource} from "./source";
import type {LeadMagnetRequest,LeadMagnetOffer} from "../canonicalDocuments/foundation/leadMagnetContracts";
export const offerValidator:Validator<LeadMagnetOffer|null,"required",string>=v.union(v.null(),v.object({
 postId:v.string(),blockId:v.string(),revision:v.number(),digest:v.string(),
 file:v.object({name:v.string(),bytes:v.number(),mimeType:v.string()}),
 audience:v.object({name:v.string(),consentText:v.string(),privacyUrl:v.string()}),
 security:v.object({honeypotEnabled:v.boolean(),honeypotFieldName:v.string(),minFillMs:v.number(),maxFormAgeMs:v.number(),captchaEnabled:v.boolean(),captchaProvider:v.union(v.literal("none"),v.literal("turnstile"),v.literal("hcaptcha"),v.literal("recaptcha")),captchaSiteKey:v.union(v.string(),v.null())}),
}));
export const offer:RegisteredQuery<"public",LeadMagnetRequest,Promise<LeadMagnetOffer|null>>=query({
 args:{postId:v.string(),blockId:v.string(),password:v.optional(v.string())},returns:offerValidator,
 handler:async(ctx,args)=>(await readLeadMagnetSource(ctx,args))?.offer??null,
});
