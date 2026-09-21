import {z} from "zod";
export type LeadMagnetRequest={postId:string;blockId:string;password?:string};
export type LeadMagnetOffer={postId:string;blockId:string;revision:number;digest:string;file:{name:string;bytes:number;mimeType:string};audience:{name:string;consentText:string;privacyUrl:string};security:{honeypotEnabled:boolean;honeypotFieldName:string;minFillMs:number;maxFormAgeMs:number;captchaEnabled:boolean;captchaProvider:"none"|"turnstile"|"hcaptcha"|"recaptcha";captchaSiteKey:string|null}};
const id=z.string().min(1).max(256);
export const leadMagnetRequestSchema:z.ZodType<LeadMagnetRequest>=z.strictObject({postId:id,blockId:z.string().min(1).max(128),password:z.string().max(1024).optional()});
export const leadMagnetOfferSchema:z.ZodType<LeadMagnetOffer>=z.strictObject({
 postId:id,blockId:z.string().min(1).max(128),revision:z.number().int().nonnegative(),
 digest:z.string().regex(/^[a-f0-9]{64}$/),
// eslint-disable-next-line no-control-regex -- Reject control characters in downloadable filenames.
 file:z.strictObject({name:z.string().min(1).max(255).regex(/^[^/\\\u0000-\u001f\u007f]+$/),bytes:z.number().int().nonnegative(),mimeType:z.string().min(1).max(120)}),
 audience:z.strictObject({name:z.string().min(1).max(160),consentText:z.string().min(1).max(1000),privacyUrl:z.string().min(1).max(2048)}),
 security:z.strictObject({honeypotEnabled:z.boolean(),honeypotFieldName:z.string().min(1).max(128),minFillMs:z.number().int().nonnegative(),maxFormAgeMs:z.number().int().positive(),captchaEnabled:z.boolean(),captchaProvider:z.enum(["none","turnstile","hcaptcha","recaptcha"]),captchaSiteKey:z.string().max(2048).nullable()}),
});

export type LeadMagnetArgs={blockId:string};
export type LeadMagnetResult={blockId:string;offer:LeadMagnetOffer|null};
export const leadMagnetArgsSchema:z.ZodType<LeadMagnetArgs>=z.strictObject({blockId:z.string().min(1).max(128)});
export const leadMagnetResultSchema:z.ZodType<LeadMagnetResult>=z.strictObject({blockId:z.string().min(1).max(128),offer:leadMagnetOfferSchema.nullable()});
export function leadMagnetMatchesArgs(args:LeadMagnetArgs,result:LeadMagnetResult):boolean{return args.blockId===result.blockId&&(result.offer===null||result.offer.blockId===args.blockId);}
