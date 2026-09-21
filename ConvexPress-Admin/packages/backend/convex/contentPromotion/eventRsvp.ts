import {promotionDataSchemas} from "@convexpress/site-contract/content-promotion";
import {ConvexError} from "convex/values";
import type {QueryCtx} from "../_generated/server";
import {validateEvent} from "../extensions/events/model";
import {rsvpTotal} from "../extensions/events/rsvpAuthority";
import {RequestReadLedger} from "../helpers/requestReadLedger";

/** Authoring may move between environments; attendance and its capacity counter never do. */
export async function validatePromotedEvent(ctx:QueryCtx,eventId:string|null,data:Record<string,unknown>,replacing=false){
 const id=eventId?ctx.db.normalizeId("extension_events",eventId):null;
 if(eventId&&!id)throw new ConvexError({code:"PROMOTION_EVENT_INVALID",message:"Invalid target event."});
 const current=id?await ctx.db.get("extension_events",id):null;
 const candidate=replacing?data:{...current,...data};
 const fields=promotionDataSchemas.event.parse(Object.fromEntries(Object.keys(promotionDataSchemas.event.shape).filter(key=>candidate[key]!==undefined).map(key=>[key,candidate[key]])));
 validateEvent(fields);
 if(current){
  const total=await rsvpTotal(ctx,{event:current,budget:new RequestReadLedger()});
  if(fields.rsvp?.capacity!==null&&fields.rsvp?.capacity!==undefined&&(total?.confirmed??0)>fields.rsvp.capacity)
   throw new ConvexError({code:"PROMOTION_EVENT_CAPACITY",message:"Event capacity is lower than the target's confirmed registrations. Increase capacity or review registrations before promoting or restoring this event."});
 }
 return fields;
}
