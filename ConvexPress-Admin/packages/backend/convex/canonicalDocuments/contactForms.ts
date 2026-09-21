import { insertWithMediaReferences, patchWithMediaReferences } from "../media/attachmentGuard";
import { syncContactMessaging } from "./contactMessaging";
import { contactFieldProjection } from "./contactFields";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { requireCan } from "../helpers/permissions";
import { requirePluginEnabled } from "../helpers/plugins";
import { initializeEmptyFormCount } from "../helpers/formSubmissionCounts";
import { parseContactDefinition } from "./foundation/contactContracts";
import { stableKey } from "./foundation/contracts";
import { contactWriteRequirement } from "./contactWriteRequirement";

const fail = (message: string): never => { throw new ConvexError({code:"CONTACT_FORM_CONFIGURATION",message}); };
/** Service-only authorization supplied by the verified publication refresh.
 * Never serialized, exposed as an endpoint argument, or inferred from an edge. */
export type ContactWriteAuthority = (capability: "form.create" | "form.update") => Promise<{ _id: Id<"users"> }>;
/** Internal authoring helper, deliberately not a registered callable endpoint.
 * The caller must validate and commit the source document in the same mutation.
 * Individual projections remain draft; document synchronization activates them
 * behind current source-page authorization in the same transaction. */
export async function syncContactForm(ctx: MutationCtx, args: {postId: Id<"posts">; blockId: string; attrs: unknown; sourceTitle?: string}, budget = new RequestReadLedger(), authority?: ContactWriteAuthority): Promise<Id<"forms">> {
  const attrs = parseContactDefinition(args.attrs);
  if (!args.blockId || args.blockId.length > 128) fail("Invalid contact block identity.");
  await requirePluginEnabled(ctx,"forms",budget);
  const { existing, capability } = await contactWriteRequirement(ctx, args.postId, args.blockId, budget);
  const user = authority ? await authority(capability) : await requireCan(ctx, capability, budget);
  budget.beforeRead(); const post = budget.record(await ctx.db.get("posts",args.postId));
  if (!post) fail("Contact source document no longer exists.");
  const definition=stableKey(attrs),now=Date.now();
  // Reconcile even an unchanged source: a generic field edit must not leave
  // the authoritative projection stale indefinitely. IDs/keys remain stable.
  const title=attrs.heading.trim() || `${args.sourceTitle ?? post!.title} — Contact`;
  let formId: Id<"forms">, groupId: Id<"fieldGroups">;
  if(existing){
    if(!existing.fieldGroupId)fail("The contact form's field group is missing.");
    formId=existing._id;groupId=existing.fieldGroupId!;
    budget.beforeRead();
    if(!budget.record(await ctx.db.get('fieldGroups',groupId)))fail("The contact form's field group is missing.");
  }else{
    // The generated ID makes slugs unique without trusting authored headings.
    formId=await ctx.db.insert("forms",{title,slug:"",status:"draft",settings:"{}",contactPostId:args.postId,contactBlockId:args.blockId,createdBy:user._id,createdAt:now,updatedAt:now});
    groupId=await ctx.db.insert("fieldGroups",{title:`${title} — Fields`,key:`contact_${formId}`,locationRules:[[{param:"form",operator:"==",value:String(formId)}]],position:"normal",style:"default",labelPlacement:"top",instructionPlacement:"label",isActive:true,menuOrder:0,createdBy:String(user._id),createdAt:now,updatedAt:now});
    await ctx.db.patch("forms",formId,{slug:`contact-${formId}`,fieldGroupId:groupId});
    await initializeEmptyFormCount(ctx,formId);
  }
  const current=[];
  for await (const field of ctx.db.query("fieldDefinitions").withIndex("by_group",q=>q.eq("groupId",groupId))) {
    budget.beforeRead(); budget.record(field); current.push(field);
    if(current.length>12)fail("The contact field group exceeds its supported size.");
  }
  const keep = new Set<string>();
  for(const [menuOrder,field] of attrs.fields.entries()){
    const key=`field_contact_${formId}_${field.name}`;keep.add(key);
    budget.beforeRead(); const old=budget.record(await ctx.db.query("fieldDefinitions").withIndex("by_key",q=>q.eq("key",key)).unique());
    // Keep IDs and keys across edits and restoration so stored answers survive.
    const value={groupId,...contactFieldProjection(field,formId,menuOrder),defaultValue:undefined,conditionalLogic:undefined,parentFieldId:undefined,instructions:undefined,wrapperClass:undefined,wrapperId:undefined,wrapperWidth:undefined,updatedAt:now};
    if(old)await patchWithMediaReferences(ctx,"fieldDefinitions",old._id,value,undefined,budget);
    else await insertWithMediaReferences(ctx,"fieldDefinitions",{...value,createdAt:now},undefined,budget);
  }
  const retired=current.filter(field=>!keep.has(field.key));
  if(retired.length){
    const key=`contact_history_${formId}`;
    budget.beforeRead(); const archive=budget.record(await ctx.db.query("fieldGroups").withIndex("by_key",q=>q.eq("key",key)).unique());
    const archiveId=archive?._id ?? await ctx.db.insert("fieldGroups",{title:`${title} — Previous fields`,key,locationRules:[],position:"normal",style:"default",labelPlacement:"top",instructionPlacement:"label",isActive:false,menuOrder:0,createdBy:String(user._id),createdAt:now,updatedAt:now});
    for(const field of retired)await patchWithMediaReferences(ctx,"fieldDefinitions",field._id,{groupId:archiveId,updatedAt:now},undefined,budget);
  }
  await ctx.db.patch("forms",formId,{title,description:attrs.body,contactDefinition:definition,updatedBy:user._id,updatedAt:now});
  await syncContactMessaging(ctx, { _id: formId, contactNotificationId: existing?.contactNotificationId, contactConfirmationId: existing?.contactConfirmationId }, attrs, user._id, budget);
  return formId;
}
