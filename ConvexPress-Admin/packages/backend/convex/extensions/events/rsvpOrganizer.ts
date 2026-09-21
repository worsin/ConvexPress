import {paginationOptsValidator} from "convex/server";
import {v} from "convex/values";
import {query,mutation,type QueryCtx} from "../../_generated/server";
import type {Id} from "../../_generated/dataModel";
import {requireCan} from "../../helpers/permissions";
import {requirePluginEnabled} from "../../helpers/plugins";
import {emitEvent} from "../../helpers/events";
import {EXTENSION_EVENTS,SYSTEM} from "../../events/constants";
import {RequestReadLedger} from "../../helpers/requestReadLedger";
import {canonicalJson,sha256Hex} from "../../canonicalDocuments/foundation/shared/fingerprints";
import {rsvpStatusValidator,rsvpReceiptValidator} from "./rsvpValidators";
import {rsvpTotal,refuse} from "./rsvpAuthority";

async function authorize(ctx:QueryCtx,eventId:Id<"extension_events">){
 const user=await requireCan(ctx,"manage_options");
 await requirePluginEnabled(ctx,"events");
 // Existing registrations remain manageable when new website submissions are disabled.
 const event=await ctx.db.get("extension_events",eventId);
 if(!event)refuse("RSVP_EVENT_MISSING","This event no longer exists.");
 return {user,event};
}
const attendee=v.object({id:v.id("event_rsvp_entries"),name:v.string(),email:v.string(),status:rsvpStatusValidator,revision:v.number(),createdAt:v.number(),updatedAt:v.number()});
export const list=query({
 args:{eventId:v.id("extension_events"),status:rsvpStatusValidator,paginationOpts:paginationOptsValidator},
 returns:v.object({page:v.array(attendee),isDone:v.boolean(),continueCursor:v.string(),splitCursor:v.optional(v.union(v.null(),v.string())),pageStatus:v.optional(v.union(v.null(),v.literal("SplitRecommended"),v.literal("SplitRequired")))}),
 handler:async(ctx,args)=>{
  await authorize(ctx,args.eventId);
  if(!Number.isSafeInteger(args.paginationOpts.numItems)||args.paginationOpts.numItems<1||args.paginationOpts.numItems>50)refuse("RSVP_PAGE_SIZE","Load between 1 and 50 registrations at a time.");
  const result=await ctx.db.query("event_rsvp_entries").withIndex("by_event_status",q=>q.eq("eventId",args.eventId).eq("status",args.status)).order("desc").paginate({...args.paginationOpts,maximumRowsRead:100,maximumBytesRead:256_000});
  return {...result,page:result.page.map(row=>({id:row._id,name:row.name,email:row.email,status:row.status,revision:row.revision,createdAt:row.createdAt,updatedAt:row.updatedAt}))};
 },
});
export const summary=query({
 args:{eventId:v.id("extension_events")},returns:v.object({confirmed:v.number(),capacity:v.union(v.null(),v.number())}),
 handler:async(ctx,{eventId})=>{
  const {event}=await authorize(ctx,eventId);
  const total=await rsvpTotal(ctx,{event,budget:new RequestReadLedger()});
  return {confirmed:total?.confirmed??0,capacity:event.rsvp?.capacity??null};
 },
});
export const cancel=mutation({
 args:{eventId:v.id("extension_events"),entryId:v.id("event_rsvp_entries"),expectedRevision:v.number(),requestKey:v.string()},returns:rsvpReceiptValidator,
 handler:async(ctx,args)=>{
  const {user,event}=await authorize(ctx,args.eventId);
  if(!Number.isSafeInteger(args.expectedRevision)||args.expectedRevision<1||args.expectedRevision>=Number.MAX_SAFE_INTEGER-1||!/^[A-Za-z0-9_-]{16,128}$/.test(args.requestKey))refuse("RSVP_REQUEST","Reload this registration before trying again.");
  const entry=await ctx.db.get("event_rsvp_entries",args.entryId);
  if(!entry||entry.eventId!==event._id)refuse("RSVP_ENTRY_MISSING","This registration no longer exists for this event.");
  const actorHash=sha256Hex(canonicalJson(["rsvp-organizer-v1",user._id]));
  const fingerprint=sha256Hex(canonicalJson(["cancel",args.entryId,args.expectedRevision]));
  const prior=await ctx.db.query("event_rsvp_operations").withIndex("by_event_actor_key",q=>q.eq("eventId",event._id).eq("actorHash",actorHash).eq("requestKey",args.requestKey)).unique();
  if(prior){if(prior.fingerprint!==fingerprint)refuse("RSVP_REQUEST_REUSED","This request was already used for another registration change.");return prior.receipt;}
  if(entry.revision!==args.expectedRevision)refuse("RSVP_CONFLICT","This registration changed. Review its current status before trying again.");
  if(entry.status!=="confirmed")refuse("RSVP_NOT_REGISTERED","This registration is already cancelled.");
  const total=await rsvpTotal(ctx,{event,budget:new RequestReadLedger()});
  if(!total||total.confirmed<1)refuse("RSVP_COUNT_UNAVAILABLE","This event's RSVP count needs repair.");
  const now=Date.now(),receipt={status:"cancelled" as const,revision:entry.revision+1};
  await ctx.db.patch("event_rsvp_entries",entry._id,{...receipt,updatedAt:now});
  await ctx.db.patch("event_rsvp_totals",total._id,{confirmed:total.confirmed-1,updatedAt:now});
  await ctx.db.insert("event_rsvp_operations",{eventId:event._id,actorHash,requestKey:args.requestKey,fingerprint,receipt,createdAt:now});
  await emitEvent(ctx,EXTENSION_EVENTS.UPDATED,SYSTEM.EXTENSION,{extensionId:"events",recordId:event._id,actorId:user._id,operation:"rsvp.cancel",registrationId:entry._id});
  return receipt;
 },
});
