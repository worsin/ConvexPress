import type {Validator} from "convex/values";
import {v} from "convex/values";
export const rsvpSettingsValidator=v.object({mode:v.union(v.literal("closed"),v.literal("guests"),v.literal("signedIn")),capacity:v.union(v.null(),v.number()),closesAt:v.union(v.null(),v.number())});
export const rsvpStatusValidator=v.union(v.literal("confirmed"),v.literal("cancelled"));
export const rsvpReceiptValidator=v.object({status:rsvpStatusValidator,revision:v.number()});

/** The stable dispatcher supports IDs from any registered owning table. */
export function createRsvpSnapshotValidator<T extends string>(eventIdValidator:Validator<T>){
return v.object({
 providerId:v.optional(v.string()),
 postId:v.id("posts"),blockId:v.string(),eventId:eventIdValidator,definitionVersion:v.string(),
 title:v.string(),href:v.string(),startsAt:v.number(),endsAt:v.number(),timeZone:v.string(),venue:v.string(),
 state:v.union(v.literal("open"),v.literal("closed"),v.literal("full"),v.literal("cancelled"),v.literal("sign-in-required")),
 closesAt:v.number(),remaining:v.union(v.null(),v.number()),responsePolicy:v.union(v.literal("guests"),v.literal("signedIn")),
 registration:v.union(v.null(),v.object({status:rsvpStatusValidator,revision:v.number(),name:v.string(),email:v.string()})),
 canCancel:v.boolean(),asOf:v.number(),nextChangeAt:v.union(v.null(),v.number()),
 security:v.object({honeypotEnabled:v.boolean(),honeypotFieldName:v.string(),captchaEnabled:v.boolean(),captchaProvider:v.union(v.literal("none"),v.literal("turnstile"),v.literal("hcaptcha"),v.literal("recaptcha")),captchaSiteKey:v.union(v.null(),v.string()),recaptchaMinScore:v.number()}),
});
}
