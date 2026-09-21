import {rsvpSettingsSchema,type RsvpSettings} from "../../canonicalDocuments/foundation/rsvpContracts";
import { ConvexError } from "convex/values";
export interface EventFields { title: string; slug: string; description: string; startsAt: number; endsAt: number; timeZone: string; venue: string; venueAddress: string; registrationUrl?: string; rsvp?: RsvpSettings }
export function validateEvent(fields: EventFields) {
  if (!fields.title.trim() || fields.title.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.slug) || fields.slug.length > 100) throw new ConvexError({ code: "INVALID_EVENT", message: "Enter a title and a lowercase hyphenated slug." });
  if (!Number.isSafeInteger(fields.startsAt) || !Number.isSafeInteger(fields.endsAt) || fields.endsAt <= fields.startsAt || fields.startsAt < 0 || fields.endsAt > 8_640_000_000_000_000) throw new ConvexError({ code: "INVALID_EVENT", message: "The end time must follow the start time." });
  if(fields.timeZone.length>100)throw new ConvexError({code:"INVALID_EVENT",message:"Choose a valid IANA time zone."});
  try { new Intl.DateTimeFormat("en-US", { timeZone: fields.timeZone }).format(fields.startsAt); }
  catch { throw new ConvexError({ code: "INVALID_EVENT", message: "Choose a valid IANA time zone." }); }
  if (fields.description.length > 50_000 || fields.venue.length > 250 || fields.venueAddress.length > 1000) throw new ConvexError({ code: "INVALID_EVENT", message: "Event details are too long." });
  if(fields.rsvp) {
    const parsed=rsvpSettingsSchema.safeParse(fields.rsvp);
    if(!parsed.success || parsed.data.closesAt!==null && parsed.data.closesAt>fields.startsAt)
      throw new ConvexError({code:"INVALID_EVENT_RSVP",message:"Choose a valid RSVP capacity and a closing time no later than the event start."});
    if(parsed.data.mode!=="closed" && fields.registrationUrl)
      throw new ConvexError({code:"INVALID_EVENT_RSVP",message:"Choose native RSVP or an external registration link for this event."});
  }
  if (fields.registrationUrl) {
    if(fields.registrationUrl.length>2048)throw new ConvexError({code:"INVALID_EVENT",message:"Registration links must be at most 2048 characters."});
    try { const url = new URL(fields.registrationUrl); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error(); }
    catch { throw new ConvexError({ code: "INVALID_EVENT", message: "Registration links must use HTTP or HTTPS." }); }
  }
}
export function publicEvent(event: EventFields & { _id: unknown; status: string }) {
  return { _id: event._id, title: event.title, slug: event.slug, description: event.description, startsAt: event.startsAt, endsAt: event.endsAt, timeZone: event.timeZone, venue: event.venue, venueAddress: event.venueAddress, registrationUrl: event.registrationUrl ?? null, status: event.status };
}
