import { ConvexError } from "convex/values";
import { readRsvpSnapshot, writeRsvp } from "./rsvp";
import { rsvpSettingsSchema } from "../../canonicalDocuments/foundation/rsvpContracts";
import type { RsvpSource } from "../../canonicalDocuments/rsvpSources";

/** Event tables and their RSVP endpoints belong to the installed extension. */
export const rsvpSource: RsvpSource = {
  id: "events",
  matchesId: (ctx, rawId) => ctx.db.normalizeId("extension_events", rawId) !== null,
  readSnapshot: readRsvpSnapshot,
  write: writeRsvp,
  verifiedAction: "extensions/events/rsvp:submitWithVerification",
  async listOptions(ctx, options, budget, now) {
    budget.beforeRead();
    const result = await ctx.db.query("extension_events").withIndex("by_status_start", q => q.eq("status", "published")).order("desc").paginate(options);
    for (const row of result.page) budget.record(row);
    if (result.pageStatus === "SplitRequired" || result.page.length > 256) throw new ConvexError({ code: "CANONICAL_PAGE_BUDGET", message: "This page exceeds the safe read budget; reduce the requested page size." });
    return { ...result, page: result.page.filter(event => {
      const config = rsvpSettingsSchema.safeParse(event.rsvp);
      return config.success && config.data.mode !== "closed" && event.startsAt > now && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.slug) && event.slug.length <= 100;
    }).map(event => ({ id: event._id, providerId: "events", title: event.title, slug: event.slug })) };
  },
};
