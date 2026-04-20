import { v } from "convex/values";

import { internalQuery } from "../../_generated/server";

const CARRIER_CUTOFFS_HOUR: Record<string, number> = {
  // Local-time hour by which the day's shipments should be manifested.
  usps: 17, // 5pm
  ups: 18, // 6pm
  fedex: 19, // 7pm
  shipstation: 19, // ShipStation aggregator — use latest cutoff
};

/**
 * List manifests that should be auto-closed: pending status AND the
 * carrier's cutoff hour for the location's timezone has passed.
 * Used by the hourly cron in PRD 7.11.
 */
export const listManifestsDueForAutoClose = internalQuery({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("commerce_shipment_manifests")
      .withIndex("by_status", (q: any) => q.eq("status", "pending"))
      .collect();

    const due: typeof pending = [];
    for (const manifest of pending) {
      const location = await ctx.db.get(manifest.shipFromLocationId);
      if (!location) continue;

      const cutoffHour = CARRIER_CUTOFFS_HOUR[manifest.carrierCode.toLowerCase()];
      if (cutoffHour === undefined) continue;

      // PRD D3 §5 — honor the location's timezone when set; fall back to UTC
      // so locations created before the timezone field existed still auto-close
      // rather than sit pending forever.
      const timezone = location.timezone || "UTC";

      // Compute current local hour at the location's timezone using Intl.
      const now = new Date();
      let localHour = NaN;
      try {
        localHour = Number(
          new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            hour: "numeric",
            hour12: false,
          }).format(now),
        );
      } catch {
        // Invalid timezone — skip this manifest, don't block the cron.
        continue;
      }

      if (Number.isFinite(localHour) && localHour >= cutoffHour) {
        due.push(manifest);
      }
    }
    return due;
  },
});

export const getManifestById = internalQuery({
  args: { manifestId: v.id("commerce_shipment_manifests") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.manifestId);
  },
});
