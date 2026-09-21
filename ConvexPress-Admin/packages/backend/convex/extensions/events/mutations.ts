import {syncEventSearch} from "./search";
import {rsvpTotal} from "./rsvpAuthority";
import {RequestReadLedger} from "../../helpers/requestReadLedger";
import {rsvpSettingsValidator} from "./rsvpValidators";
import {eventIntervalBucket} from "../../canonicalDocuments/foundation/eventIntervalIndex";
import { mutation } from "../../_generated/server";
import { ConvexError, v } from "convex/values";
import { requireCan } from "../../helpers/permissions";
import { requirePluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { EXTENSION_EVENTS, SYSTEM } from "../../events/constants";
import { eventStatus } from "./schema";
import { validateEvent } from "./model";
import {requireEventCategory} from "./categories";
const fields = { rsvp:v.optional(rsvpSettingsValidator), title: v.string(), slug: v.string(), description: v.string(), startsAt: v.number(), endsAt: v.number(), timeZone: v.string(), venue: v.string(), venueAddress: v.string(), registrationUrl: v.optional(v.string()), categoryId:v.optional(v.union(v.id("extension_event_categories"),v.null())) };
export const create = mutation({
  args: fields, returns: v.id("extension_events"),
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "manage_options"); await requirePluginEnabled(ctx, "events"); validateEvent(args);
    if (await ctx.db.query("extension_events").withIndex("by_slug", q => q.eq("slug", args.slug)).unique()) throw new ConvexError({ code: "DUPLICATE_SLUG", message: "An event already uses that slug." });
    if(args.categoryId)await requireEventCategory(ctx,args.categoryId);
    const now = Date.now();
    const id = await ctx.db.insert("extension_events", { ...args, calendarBucket:eventIntervalBucket(args.startsAt,args.endsAt), categoryId:args.categoryId??undefined, title: args.title.trim(), status: "draft", createdBy: user._id, createdAt: now, updatedAt: now });
    await syncEventSearch(ctx,id);
    await emitEvent(ctx, EXTENSION_EVENTS.CREATED, SYSTEM.EXTENSION, { extensionId: "events", recordId: id, actorId: user._id });
    return id;
  },
});
export const update = mutation({
  args: { id: v.id("extension_events"), expectedUpdatedAt: v.number(), ...fields, status: eventStatus }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "manage_options"); await requirePluginEnabled(ctx, "events");
    const event = await ctx.db.get("extension_events", args.id);
    if (!event) throw new ConvexError({ code: "NOT_FOUND", message: "Event not found." });
    if (event.updatedAt !== args.expectedUpdatedAt) throw new ConvexError({ code: "EVENT_CONFLICT", message: "This event changed in another editor. Reload before saving." });
    const effectiveRsvp=args.rsvp??event.rsvp;
    validateEvent({...args,rsvp:effectiveRsvp});
    if(effectiveRsvp?.capacity!==null && effectiveRsvp?.capacity!==undefined) {
      const total=await rsvpTotal(ctx,{event,budget:new RequestReadLedger()});
      if(total && (!Number.isSafeInteger(total.confirmed) || total.confirmed<0))throw new ConvexError({code:"EVENT_RSVP_COUNT",message:"This event's attendee count needs repair before changing its capacity."});
      if((total?.confirmed??0)>effectiveRsvp.capacity)throw new ConvexError({code:"EVENT_RSVP_CAPACITY",message:"Capacity cannot be lower than the number of confirmed RSVPs."});
    }
    if(args.categoryId)await requireEventCategory(ctx,args.categoryId);
    const duplicate = await ctx.db.query("extension_events").withIndex("by_slug", q => q.eq("slug", args.slug)).unique();
    if (duplicate && duplicate._id !== event._id) throw new ConvexError({ code: "DUPLICATE_SLUG", message: "An event already uses that slug." });
    const { id, expectedUpdatedAt, categoryId, ...values } = args;
    await ctx.db.patch("extension_events", id, { ...values, calendarBucket:eventIntervalBucket(values.startsAt,values.endsAt), ...(categoryId===undefined?{}:{categoryId:categoryId??undefined}), registrationUrl: values.registrationUrl || undefined, title: values.title.trim(), updatedAt: Math.max(Date.now(), expectedUpdatedAt + 1) });
    await syncEventSearch(ctx,id);
    await emitEvent(ctx, args.status === "archived" ? EXTENSION_EVENTS.ARCHIVED : EXTENSION_EVENTS.UPDATED, SYSTEM.EXTENSION, { extensionId: "events", recordId: id, actorId: user._id, fromStatus: event.status, toStatus: args.status });
    return null;
  },
});
