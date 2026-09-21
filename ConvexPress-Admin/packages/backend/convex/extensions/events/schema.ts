import {rsvpSettingsValidator,rsvpStatusValidator,rsvpReceiptValidator} from "./rsvpValidators";
import { defineTable } from "convex/server";
import { v } from "convex/values";
export const eventStatus = v.union(v.literal("draft"), v.literal("published"), v.literal("cancelled"), v.literal("archived"));
/** Named separately from the platform's event-dispatch audit table. */
export const eventCategoryFields = {name:v.string(),slug:v.string(),createdAt:v.number(),updatedAt:v.number()};
export const eventCategoryDocument = v.object({_id:v.id("extension_event_categories"),_creationTime:v.number(),...eventCategoryFields});
export const tables = {
  event_rsvp_totals: defineTable({eventId:v.id("extension_events"),confirmed:v.number(),updatedAt:v.number()}).index("by_event",["eventId"]),
  event_rsvp_entries: defineTable({eventId:v.id("extension_events"),actorHash:v.string(),userId:v.optional(v.id("users")),name:v.string(),email:v.string(),status:rsvpStatusValidator,revision:v.number(),createdAt:v.number(),updatedAt:v.number()})
    .index("by_event_actor",["eventId","actorHash"]).index("by_event_status",["eventId","status"]),
  event_rsvp_operations: defineTable({eventId:v.id("extension_events"),actorHash:v.string(),requestKey:v.string(),fingerprint:v.string(),receipt:rsvpReceiptValidator,createdAt:v.number()})
    .index("by_event_actor_key",["eventId","actorHash","requestKey"]).index("by_event",["eventId"]),
  event_rsvp_rate_limits: defineTable({eventId:v.id("extension_events"),windowStart:v.number(),accepted:v.number(),updatedAt:v.number()}).index("by_event",["eventId"]),
  extension_event_categories: defineTable(eventCategoryFields).index("by_slug",["slug"]).index("by_name",["name"]),
  extension_events: defineTable({
    title: v.string(), slug: v.string(), description: v.string(),
    startsAt: v.number(), endsAt: v.number(), timeZone: v.string(),
    venue: v.string(), venueAddress: v.string(),
    registrationUrl: v.optional(v.string()),
    rsvp: v.optional(rsvpSettingsValidator),
    categoryId: v.optional(v.id("extension_event_categories")),
    calendarBucket: v.optional(v.string()),
    status: eventStatus, createdBy: v.id("users"), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_calendar_bucket",["calendarBucket"]).index("by_calendar_start",["calendarBucket","status","startsAt"]).index("by_calendar_end",["calendarBucket","status","endsAt"]).index("by_category_calendar_start",["categoryId","calendarBucket","status","startsAt"]).index("by_category_calendar_end",["categoryId","calendarBucket","status","endsAt"]).index("by_slug", ["slug"]).index("by_status_start", ["status", "startsAt"]).index("by_updated", ["updatedAt"]).index("by_category",["categoryId"]).index("by_category_status_start",["categoryId","status","startsAt"]),
};
