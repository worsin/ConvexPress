import { v, ConvexError } from "convex/values";
import type { RegisteredMutation } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { canonicalBoundary, writePromotedCanonicalDocument } from "./service";

/** Internal transaction boundary, never a public JSON authoring endpoint. The
 * promotion adapter supplies reviewed, resolved fields; canonical authoring still
 * verifies authority, schema, policy and resources. Explicit clears survive the
 * Convex argument serializer, which omits undefined object properties. */
export type PromotionWriteArgs = {targetId:Id<"posts">|null;fieldsJson:string;clearFields:string[];restoring:boolean;allocation?:{receiptId:Id<'contentPromotion_receipts'>;key:string}};
export const write:RegisteredMutation<"internal",PromotionWriteArgs,Promise<Id<"posts">>> = internalMutation({
  args:{targetId:v.union(v.id("posts"),v.null()),fieldsJson:v.string(),clearFields:v.array(v.string()),restoring:v.boolean(),allocation:v.optional(v.object({receiptId:v.id('contentPromotion_receipts'),key:v.string()}))},
  returns:v.id("posts"),
  handler:async(ctx:MutationCtx,args:PromotionWriteArgs):Promise<Id<"posts">>=>canonicalBoundary(async()=>{
    if(new TextEncoder().encode(args.fieldsJson).byteLength>512*1024 || args.clearFields.length>100 || new Set(args.clearFields).size!==args.clearFields.length)
      throw new ConvexError({code:"PROMOTION_CANONICAL_INVALID",message:"Canonical authoring transfer exceeds its bounds."});
    const fields:unknown=JSON.parse(args.fieldsJson);
    if(!fields || typeof fields!=="object" || Array.isArray(fields))throw new ConvexError({code:"PROMOTION_CANONICAL_INVALID",message:"Expected canonical authoring fields."});
    for(const key of [...Object.keys(fields),...args.clearFields])
      if(!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key) || ["constructor","prototype"].includes(key))throw new ConvexError({code:"PROMOTION_CANONICAL_INVALID",message:"Invalid canonical authoring field."});
    const resolved={...fields} as Record<string,unknown>;
    for(const key of args.clearFields){if(key in resolved)throw new ConvexError({code:"PROMOTION_CANONICAL_INVALID",message:"Conflicting canonical field clear."});resolved[key]=undefined;}
    return writePromotedCanonicalDocument(ctx,args.targetId,resolved,args.restoring,args.allocation);
  }),
});
