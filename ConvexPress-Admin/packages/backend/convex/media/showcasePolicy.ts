import {z} from "zod";
import {sha256Hex} from "@convexpress/site-contract";
import type {Doc} from "../_generated/dataModel";
export const SHOWCASE_META_PREFIX="_cp_showcase:";
const text=(max:number)=>z.string().trim().max(max);
export const showcaseFieldsSchema=z.strictObject({
 creditName:text(160).min(1),creditUrl:text(2048).nullable(),altText:text(500).min(1),caption:text(1000),
 rightsBasis:z.enum(["owned","permission","license"]),permissionNote:text(2000).min(1),
 expiresAt:z.number().int().positive().max(8640000000000000).nullable(),
}).refine(value=>value.creditUrl===null||isCreditUrl(value.creditUrl),"Credit link must be an HTTPS URL without credentials");
export const showcasePublicationSchema=showcaseFieldsSchema.safeExtend({
 version:z.literal(1),revision:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),approved:z.boolean(),websiteKey:text(256).min(1),instanceKey:text(256).min(1),
 fingerprint:z.string().regex(/^[a-f0-9]{64}$/),reviewedBy:text(256).min(1),reviewedAt:z.number().int().nonnegative(),
});
export type ShowcaseFields=z.infer<typeof showcaseFieldsSchema>;
export type ShowcasePublication=z.infer<typeof showcasePublicationSchema>;
export function isCreditUrl(value:string){try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&!/[\s\\]/u.test(value);}catch{return false;}}
/** An approval is invalidated by replacing, editing, trashing or restoring media.
 * It belongs to one site installation; promotion requires target-side review. */
export function showcaseFingerprint(media:Doc<"media">){return sha256Hex(JSON.stringify([media._id,media.storageId??null,media.url,media.mimeType,media.fileSize,media.updatedAt]));}
export function parseShowcasePublication(value:string):ShowcasePublication|null{
 if(value.length>8192)return null;
 try{const result=showcasePublicationSchema.safeParse(JSON.parse(value));return result.success?result.data:null;}catch{return null;}
}
