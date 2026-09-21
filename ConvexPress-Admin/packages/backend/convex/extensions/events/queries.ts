import {canReadEventRoute,canReadEventsRoute,canReadEventDetailRoute} from "./publicAccess";
import { query } from "../../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireCan } from "../../helpers/permissions";
import { isPluginEnabled, requirePluginEnabled } from "../../helpers/plugins";
import { eventStatus } from "./schema";
import { publicEvent } from "./model";
export const list = query({
  args: { paginationOpts: paginationOptsValidator, status: v.optional(eventStatus) }, returns: v.any(), // Convex pagination envelope contains cursor metadata.
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options"); await requirePluginEnabled(ctx, "events");
    if (args.status) return ctx.db.query("extension_events").withIndex("by_status_start", q => q.eq("status", args.status!)).order("desc").paginate(args.paginationOpts);
    return ctx.db.query("extension_events").withIndex("by_updated").order("desc").paginate(args.paginationOpts);
  },
});
export const get = query({
  args: { id: v.id("extension_events") }, returns: v.any(), // Authenticated editor requires the full event record.
  handler: async (ctx, args) => { await requireCan(ctx, "manage_options"); await requirePluginEnabled(ctx, "events"); return ctx.db.get("extension_events", args.id); },
});
export const upcoming = query({
  args: { paginationOpts: paginationOptsValidator, startsAtOrAfter: v.optional(v.number()) }, returns: v.any(), // Public projection inside the standard pagination envelope.
  handler: async (ctx, args) => {
    if (!await isPluginEnabled(ctx, "events") || !await canReadEventsRoute(ctx)) return { page: [], isDone: true, continueCursor: "" };
    const anchor = args.startsAtOrAfter;
    if (anchor !== undefined && (!Number.isSafeInteger(anchor) || anchor < 0 || anchor > 8_640_000_000_000_000)) throw Error("Invalid event window start");
    // Convex replays pagination with an endCursor when a document changes.
    // Every index bound must therefore be stable for the subscription's args.
    const page = await ctx.db.query("extension_events").withIndex("by_status_start", q => {
      const published = q.eq("status", "published");
      return anchor === undefined ? published : published.gte("startsAt", anchor);
    }).order("asc").paginate(args.paginationOpts);
    // Old bundles have no anchor. Keep their query fingerprint stable during a
    // rolling update, then filter this bounded page. They may need to continue
    // past an empty historical page until the new anchored bundle is deployed.
    const events = anchor === undefined ? page.page.filter(event => event.startsAt >= Date.now()) : page.page;
    const visible=[];
    for(const event of events)if(await canReadEventDetailRoute(ctx,event.slug))visible.push(publicEvent(event));
    return { ...page, page: visible };
  },
});
export const getBySlug = query({
  args: { slug: v.string() }, returns: v.any(), // Explicit nullable public DTO; no author or internal audit fields.
  handler: async (ctx, args) => {
    if (!await isPluginEnabled(ctx, "events")) return null;
    const event = await ctx.db.query("extension_events").withIndex("by_slug", q => q.eq("slug", args.slug)).unique();
    return event && (event.status === "published" || event.status === "cancelled") && await canReadEventRoute(ctx,event.slug) ? publicEvent(event) : null;
  },
});
