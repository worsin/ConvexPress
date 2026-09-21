import {ConvexError} from "convex/values";
import type {QueryCtx} from "../../_generated/server";
import type {Id} from "../../_generated/dataModel";
import {readPublicBlockSource} from "../../canonicalDocuments/publicBlockSource";
import {isPluginEnabled} from "../../helpers/plugins";
import {RequestReadLedger} from "../../helpers/requestReadLedger";
import {canReadEventRoute} from "./publicAccess";
import {rsvpSettingsSchema} from "../../canonicalDocuments/foundation/rsvpContracts";
import {sha256Hex,canonicalJson} from "../../canonicalDocuments/foundation/shared/fingerprints";
export type RsvpTarget={postId:Id<"posts">;blockId:string;instanceKey:string;password?:string;visitorToken?:string};
export function refuse(code="RSVP_UNAVAILABLE",message="This RSVP is unavailable. Refresh the page before trying again."):never{throw new ConvexError({code,message});}
export async function rsvpAuthority(ctx:QueryCtx,args:RsvpTarget,budget=new RequestReadLedger()){
 if(args.instanceKey.length>256 || args.visitorToken!==undefined&&!/^[a-f0-9]{64}$/.test(args.visitorToken))return null;
 budget.beforeRead();const identity=budget.record(await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key",q=>q.eq("identityKey","site-identity")).unique());
 if(!identity||identity.instanceKey!==args.instanceKey)return null;
 if(!await isPluginEnabled(ctx,"forms",budget))return null;
 const source=await readPublicBlockSource(ctx,{...args,blockName:"core/event-rsvp",plugin:"events"},budget);if(!source)return null;
 const raw=(source.node.attrs as {event?:unknown}).event;
 const id=typeof raw==="string"?ctx.db.normalizeId("extension_events",raw):null;if(!id)return null;
 budget.beforeRead();const event=budget.record(await ctx.db.get("extension_events",id));
 if(!event || (event.status!=="published"&&event.status!=="cancelled") || !await canReadEventRoute(ctx,event.slug,budget))return null;
 const config=rsvpSettingsSchema.safeParse(event.rsvp);if(!config.success||config.data.mode==="closed")return null;
 const closesAt=config.data.closesAt??event.startsAt;if(closesAt>event.startsAt)return null;
 // Guest uniqueness is per stored browser token; it is not proof of one human
 // or ownership of an email address. Verified accounts take precedence.
 const actor=source.userId?`user:${source.userId}`:config.data.mode==="guests"&&args.visitorToken?`visitor:${args.visitorToken}`:null;
 const actorHash=actor?sha256Hex(canonicalJson(["event-rsvp-actor-v1",identity.instanceKey,event._id,actor])):null;
 const definitionVersion=sha256Hex(canonicalJson(["event-rsvp-definition-v1",event._id,event.updatedAt,event.status,event.startsAt,event.endsAt,config.data]));
 return {event,settings:config.data,closesAt,actorHash,userId:source.userId,definitionVersion,budget};
}
export type RsvpAuthority=NonNullable<Awaited<ReturnType<typeof rsvpAuthority>>>;
export async function ownRsvp(ctx:QueryCtx,source:RsvpAuthority){
 if(!source.actorHash)return null;source.budget.beforeRead();return source.budget.record(await ctx.db.query("event_rsvp_entries").withIndex("by_event_actor",q=>q.eq("eventId",source.event._id).eq("actorHash",source.actorHash!)).unique());
}
export async function rsvpTotal(ctx:QueryCtx,source:Pick<RsvpAuthority,"event"|"budget">){
 source.budget.beforeRead();const total=source.budget.record(await ctx.db.query("event_rsvp_totals").withIndex("by_event",q=>q.eq("eventId",source.event._id)).unique());
 if(total&&(!Number.isSafeInteger(total.confirmed)||total.confirmed<0||total.confirmed>=Number.MAX_SAFE_INTEGER-1))refuse("RSVP_COUNT_UNAVAILABLE","This event's RSVP count needs repair.");
 // A partial restore must not silently recreate an empty capacity counter.
 // Prefix lookup reads at most one attendee, regardless of event size.
 if(!total){
  source.budget.beforeRead();const existing=source.budget.record(await ctx.db.query("event_rsvp_entries").withIndex("by_event_actor",q=>q.eq("eventId",source.event._id)).first());
  if(existing)refuse("RSVP_COUNT_UNAVAILABLE","This event's RSVP count needs repair.");
 }
 return total;
}
