import {mutation,query,type MutationCtx} from "../../_generated/server";
import type {Id} from "../../_generated/dataModel";
import {ConvexError,v} from "convex/values";
import {paginationOptsValidator} from "convex/server";
import {requireCan} from "../../helpers/permissions";
import {requirePluginEnabled} from "../../helpers/plugins";
import {emitEvent} from "../../helpers/events";
import {EXTENSION_EVENTS,SYSTEM} from "../../events/constants";
import {eventCategoryDocument} from "./schema";
const fields={name:v.string(),slug:v.string()};
const fail=(code:string,message:string):never=>{throw new ConvexError({code,message});};
function valid(input:{name:string;slug:string}) {
 const name=input.name.trim();
 if(!name||name.length>120||input.name.length>256||input.slug.length>100||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug))fail("INVALID_EVENT_CATEGORY","Enter a category name and a lowercase hyphenated slug.");
 return {name,slug:input.slug};
}
/** Only the event table's own category IDs are assignable. Post taxonomy is unrelated. */
export async function requireEventCategory(ctx:Pick<MutationCtx,"db">,id:Id<"extension_event_categories">) {
 const category=await ctx.db.get("extension_event_categories",id);
 if(!category)return fail("EVENT_CATEGORY_NOT_FOUND","The selected event category no longer exists.");
 return category;
}
export const list=query({
 args:{paginationOpts:paginationOptsValidator},
 returns:v.object({page:v.array(eventCategoryDocument),isDone:v.boolean(),continueCursor:v.string(),splitCursor:v.optional(v.union(v.string(),v.null())),pageStatus:v.optional(v.union(v.literal("SplitRecommended"),v.literal("SplitRequired"),v.null()))}),
 handler:async(ctx,{paginationOpts})=>{
  await requireCan(ctx,"manage_options");await requirePluginEnabled(ctx,"events");
  if(!Number.isInteger(paginationOpts.numItems)||paginationOpts.numItems<1||paginationOpts.numItems>50)fail("INVALID_EVENT_CATEGORY_PAGE","Request between 1 and 50 event categories.");
  return ctx.db.query("extension_event_categories").withIndex("by_name").paginate(paginationOpts);
 }
});
export const create=mutation({args:fields,returns:v.id("extension_event_categories"),handler:async(ctx,args)=>{
 const user=await requireCan(ctx,"manage_options");await requirePluginEnabled(ctx,"events");const data=valid(args);
 if(await ctx.db.query("extension_event_categories").withIndex("by_slug",q=>q.eq("slug",data.slug)).unique())fail("DUPLICATE_EVENT_CATEGORY","An event category already uses that slug.");
 const now=Date.now(),id=await ctx.db.insert("extension_event_categories",{...data,createdAt:now,updatedAt:now});
 await emitEvent(ctx,EXTENSION_EVENTS.CREATED,SYSTEM.EXTENSION,{extensionId:"events",recordType:"eventCategory",recordId:id,actorId:user._id});return id;
}});
export const update=mutation({args:{id:v.id("extension_event_categories"),expectedUpdatedAt:v.number(),...fields},returns:v.null(),handler:async(ctx,args)=>{
 const user=await requireCan(ctx,"manage_options");await requirePluginEnabled(ctx,"events");const row=await requireEventCategory(ctx,args.id);
 if(row.updatedAt!==args.expectedUpdatedAt)fail("EVENT_CATEGORY_CONFLICT","This category changed in another editor. Reload before saving.");
 const data=valid(args),duplicate=await ctx.db.query("extension_event_categories").withIndex("by_slug",q=>q.eq("slug",data.slug)).unique();
 if(duplicate&&duplicate._id!==row._id)fail("DUPLICATE_EVENT_CATEGORY","An event category already uses that slug.");
 await ctx.db.patch("extension_event_categories",row._id,{...data,updatedAt:Math.max(Date.now(),row.updatedAt+1)});
 await emitEvent(ctx,EXTENSION_EVENTS.UPDATED,SYSTEM.EXTENSION,{extensionId:"events",recordType:"eventCategory",recordId:row._id,actorId:user._id});return null;
}});
export const remove=mutation({args:{id:v.id("extension_event_categories"),expectedUpdatedAt:v.number()},returns:v.null(),handler:async(ctx,args)=>{
 const user=await requireCan(ctx,"manage_options");await requirePluginEnabled(ctx,"events");const row=await requireEventCategory(ctx,args.id);
 if(row.updatedAt!==args.expectedUpdatedAt)fail("EVENT_CATEGORY_CONFLICT","This category changed in another editor. Reload before deleting.");
 if(await ctx.db.query("extension_events").withIndex("by_category",q=>q.eq("categoryId",row._id)).first())fail("EVENT_CATEGORY_IN_USE","Move events to another category before deleting this category.");
 await ctx.db.delete("extension_event_categories",row._id);
 await emitEvent(ctx,EXTENSION_EVENTS.ARCHIVED,SYSTEM.EXTENSION,{extensionId:"events",recordType:"eventCategory",recordId:row._id,actorId:user._id});return null;
}});
export const get=query({args:{id:v.id('extension_event_categories')},returns:v.union(eventCategoryDocument,v.null()),handler:async(ctx,{id})=>{
 await requireCan(ctx,'manage_options');await requirePluginEnabled(ctx,'events');return ctx.db.get('extension_event_categories',id);
}});
