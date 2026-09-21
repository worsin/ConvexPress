import {z} from "zod";
import {eventTimeZoneSchema} from "./eventContracts";
import {safeLinkSchema} from "./generated/field-runtime.mjs";
export const rsvpProviderIdSchema=z.string().min(1).max(48).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const timestamp=z.number().int().min(0).max(8_640_000_000_000_000);
export const rsvpSettingsSchema=z.strictObject({
 mode:z.enum(["closed","guests","signedIn"]),
 capacity:z.number().int().min(1).max(1_000_000).nullable(),
 closesAt:timestamp.nullable(),
});
export type RsvpSettings=z.infer<typeof rsvpSettingsSchema>;
export const disabledRsvpSettings:RsvpSettings={mode:"closed",capacity:null,closesAt:null};
export const rsvpContactSchema=z.strictObject({
 name:z.string().trim().min(1).max(160),email:z.string().trim().max(254).email(),
});
export const rsvpArgsSchema=z.strictObject({event:z.string().min(1).max(256).optional(),blockId:z.string().min(1).max(128)});
export const rsvpReceiptSchema=z.strictObject({status:z.enum(["confirmed","cancelled"]),revision:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1)});
export const rsvpSnapshotSchema=z.strictObject({
 providerId:rsvpProviderIdSchema.optional(),
 postId:z.string().min(1).max(256),blockId:z.string().min(1).max(128),eventId:z.string().min(1).max(256),
 definitionVersion:z.string().regex(/^[a-f0-9]{64}$/),
 title:z.string().min(1).max(200),href:safeLinkSchema(z,["relative"]).max(256),
 startsAt:timestamp,endsAt:timestamp,timeZone:eventTimeZoneSchema,venue:z.string().max(250),
 state:z.enum(["open","closed","full","cancelled","sign-in-required"]),
 closesAt:timestamp,remaining:z.number().int().min(0).max(1_000_000).nullable(),
 responsePolicy:z.enum(["guests","signedIn"]),
 registration:z.strictObject({status:z.enum(["confirmed","cancelled"]),revision:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1),name:z.string().max(160),email:z.string().max(254)}).nullable(),
 canCancel:z.boolean(),asOf:timestamp,nextChangeAt:timestamp.nullable(),
 security:z.strictObject({honeypotEnabled:z.boolean(),honeypotFieldName:z.string().min(1).max(256),captchaEnabled:z.boolean(),captchaProvider:z.enum(["none","turnstile","hcaptcha","recaptcha"]),captchaSiteKey:z.string().max(1000).nullable(),recaptchaMinScore:z.number().min(0).max(1)}),
}).superRefine((value,ctx)=>{
 if(value.endsAt<=value.startsAt || value.closesAt>value.startsAt)ctx.addIssue({code:"custom",message:"Invalid RSVP schedule"});
 if(value.nextChangeAt!==null && value.nextChangeAt<=value.asOf)ctx.addIssue({code:"custom",message:"RSVP refresh must be in the future"});
 if(value.canCancel && (value.registration?.status!=="confirmed" || value.asOf>=value.startsAt))ctx.addIssue({code:"custom",message:"Cancellation requires a current future RSVP"});
 if(value.state==="open" && (value.asOf>=value.closesAt || value.remaining===0 && value.registration?.status!=="confirmed"))ctx.addIssue({code:"custom",message:"Registration is closed or full"});
 const prefix=`/${value.providerId??"events"}/`;
 if(!value.href.startsWith(prefix)||! /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.href.slice(prefix.length)))ctx.addIssue({code:"custom",message:"Invalid event route"});
});
export const rsvpResultSchema=z.strictObject({eventId:z.string().min(1).max(256).nullable(),blockId:z.string().min(1).max(128),rsvp:rsvpSnapshotSchema.nullable(),asOf:timestamp,nextChangeAt:timestamp.nullable()}).superRefine((value,ctx)=>{
 if(value.nextChangeAt!==null && value.nextChangeAt<=value.asOf)ctx.addIssue({code:"custom",message:"RSVP result refresh must be in the future"});
 if(value.rsvp && (value.rsvp.asOf!==value.asOf || value.rsvp.nextChangeAt!==value.nextChangeAt))ctx.addIssue({code:"custom",message:"RSVP result schedule mismatch"});
 if(value.rsvp && (value.rsvp.eventId!==value.eventId || value.rsvp.blockId!==value.blockId))ctx.addIssue({code:"custom",message:"RSVP source binding mismatch"});
});
export type RsvpSnapshot=z.infer<typeof rsvpSnapshotSchema>;
export type RsvpArgs=z.infer<typeof rsvpArgsSchema>;
export type RsvpResult=z.infer<typeof rsvpResultSchema>;
export type RsvpReceipt=z.infer<typeof rsvpReceiptSchema>;
export function rsvpMatchesArgs(args:RsvpArgs,result:RsvpResult){return (args.event??null)===result.eventId && args.blockId===result.blockId;}
