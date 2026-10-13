"use node";

/**
 * PRD 7.6 — Tracking sync action.
 *
 * For shipments that haven't been delivered (and aren't very old), poll the
 * carrier API for the latest status. Webhooks are preferred but not all
 * provider+merchant combinations have webhooks configured, so this acts as
 * a guaranteed fallback.
 *
 * Called by:
 *   - Cron job (PRD 7.7 — every 4h)
 *   - Manual "Sync now" button on order detail tracking tab
 */

import { v } from "convex/values";
import { ConvexError } from "convex/values";

import { internalAction, type ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { getDecryptedProviderPayload } from "../providers/_shared/credentials";
import { at, readJson, str, timeOf } from "../helpers/json";
import {
  normalizeShipStationStatus,
  normalizeFedexStatus,
  normalizeUpsStatus,
  normalizeUspsStatus,
} from "./statusNormalization";

const TERMINAL_STATUSES = new Set([
  "delivered",
  "returned",
]);

const POLL_LOOKBACK_MS = 60 * 24 * 60 * 60 * 1000; // poll for 60 days max

export const syncTracking = internalAction({
  args: {
    shipmentLabelId: v.optional(v.id("commerce_shipment_labels")),
    maxAgeMs: v.optional(v.number()),
  },
  returns: v.object({ synced: v.number(), failed: v.number(), total: v.number() }),
  handler: async (ctx, args) => {
    const labelsToSync = args.shipmentLabelId
      ? [
          await ctx.runQuery(
            internal.shipping.tracking.internals.getLabelById,
            { labelId: args.shipmentLabelId },
          ),
        ].filter((l): l is NonNullable<typeof l> => l !== null)
      : await ctx.runQuery(
          internal.shipping.tracking.internals.listSyncableLabels,
          { maxAgeMs: args.maxAgeMs ?? POLL_LOOKBACK_MS },
        );

    let synced = 0;
    let failed = 0;

    for (const label of labelsToSync) {
      const { trackingNumber, provider } = label;
      if (!trackingNumber || !provider) continue;

      const syncStart = Date.now();
      let result: { success: boolean; status?: string } = { success: false };
      let errorMessage: string | undefined;
      try {
        result = await fetchTrackingForLabel(ctx, {
          _id: label._id,
          shipmentId: label.shipmentId,
          trackingNumber,
          provider,
          carrierCode: label.carrierCode,
        });
        if (result.success) synced += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
        errorMessage = err instanceof Error ? err.message : String(err);
        // Don't throw — best-effort sync.
      }
      // PRD D2 §5 — durable sync log (replaces console.error-only trace).
      await ctx.runMutation(
        internal.shipping.tracking.internals.recordSyncLog,
        {
          provider: label.provider,
          shipmentId: label.shipmentId,
          labelId: label._id,
          trackingNumber: label.trackingNumber,
          source: "poll" as const,
          success: result.success,
          durationMs: Date.now() - syncStart,
          errorMessage: errorMessage?.slice(0, 500),
        },
      );
    }

    return { synced, failed, total: labelsToSync.length };
  },
});

type TrackedLabel = {
  _id: Id<"commerce_shipment_labels">;
  shipmentId: Id<"commerce_shipments">;
  trackingNumber: string;
};

async function fetchTrackingForLabel(
  ctx: ActionCtx,
  label: {
    _id: Id<"commerce_shipment_labels">;
    shipmentId: Id<"commerce_shipments">;
    trackingNumber: string;
    provider: string;
    carrierCode?: string;
  },
): Promise<{ success: boolean; status?: string }> {
  const provider = label.provider.toLowerCase();

  if (provider === "shipstation") {
    return await syncShipStation(ctx, label);
  }
  if (provider === "fedex") {
    return await syncFedex(ctx, label);
  }
  if (provider === "ups") {
    return await syncUps(ctx, label);
  }
  if (provider === "usps") {
    return await syncUsps(ctx, label);
  }
  // DHL tracking sync deferred — capability flag = false in PRD C5.
  return { success: false };
}

async function syncShipStation(
  ctx: ActionCtx,
  label: TrackedLabel & { carrierCode?: string },
) {
  let apiKey: string | undefined;
  let apiBaseUrl = "https://api.shipengine.com";
  try {
    const creds = await getDecryptedProviderPayload(ctx, "shipstation");
    apiKey = creds.apiKey;
    apiBaseUrl = (creds.apiBaseUrl || apiBaseUrl).replace(/\/+$/, "");
  } catch {
    return { success: false };
  }
  if (!apiKey) return { success: false };

  const url = `${apiBaseUrl}/v1/tracking?carrier_code=${encodeURIComponent(label.carrierCode ?? "")}&tracking_number=${encodeURIComponent(label.trackingNumber)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { "API-Key": apiKey, Accept: "application/json" },
  });
  if (!response.ok) return { success: false };

  const data = await readJson(response);
  const code = String(at(data, "status_code") ?? "").toUpperCase();
  if (!code) return { success: false };

  const deliveredAt = at(data, "actual_delivery_date");
  const statusDescription = str(at(data, "status_description"));
  await ctx.runMutation(internal.shipping.tracking.mutations.recordTrackingEvent, {
    shipmentId: label.shipmentId,
    labelId: label._id,
    eventId: `shipstation:${code}:${str(deliveredAt) ?? Date.now()}`,
    occurredAt: timeOf(deliveredAt) ?? Date.now(),
    normalizedStatus: normalizeShipStationStatus(code),
    carrierStatus: statusDescription ?? code,
    description: statusDescription,
    rawMetadata: data,
    receivedVia: "poll",
  });
  return { success: true, status: code };
}

async function syncFedex(
  ctx: ActionCtx,
  label: TrackedLabel,
) {
  // Reuse FedEx OAuth helper.
  const { getFedexAccessTokenV2 } = await import("../providers/fedex/auth");
  let accessToken: string;
  let apiBaseUrl: string;
  try {
    const r = await getFedexAccessTokenV2(ctx);
    accessToken = r.accessToken;
    apiBaseUrl = r.credentials.apiBaseUrl;
  } catch {
    return { success: false };
  }

  const response = await fetch(`${apiBaseUrl}/track/v1/trackingnumbers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-customer-transaction-id": `convexpress-track-${Date.now()}`,
    },
    body: JSON.stringify({
      includeDetailedScans: false,
      trackingInfo: [{ trackingNumberInfo: { trackingNumber: label.trackingNumber } }],
    }),
  });
  if (!response.ok) return { success: false };

  const data = await readJson(response);
  const trackResult = at(data, "output", "completeTrackResults", 0, "trackResults", 0);
  if (!trackResult) return { success: false };

  const code = String(at(trackResult, "latestStatusDetail", "code") ?? "");
  // Stable event id: prefer FedEx scanEvent/dateAndTime when present so a
  // re-poll of the same delivery state doesn't create duplicate rows.
  const latestScan = at(trackResult, "scanEvents", 0);
  const occurredAt = timeOf(at(latestScan, "date")) ?? Date.now();
  const statusDescription = str(at(trackResult, "latestStatusDetail", "description"));
  const scanSignature =
    str(at(latestScan, "eventType")) ??
    str(at(latestScan, "eventDescription")) ??
    statusDescription ??
    code;
  await ctx.runMutation(internal.shipping.tracking.mutations.recordTrackingEvent, {
    shipmentId: label.shipmentId,
    labelId: label._id,
    eventId: `fedex:${label.trackingNumber}:${scanSignature}:${occurredAt}`,
    occurredAt,
    normalizedStatus: normalizeFedexStatus(code),
    carrierStatus: str(at(trackResult, "latestStatusDetail", "statusByLocale")) ?? code,
    description: statusDescription,
    rawMetadata: trackResult,
    receivedVia: "poll",
  });
  return { success: true, status: code };
}

async function syncUps(
  ctx: ActionCtx,
  label: TrackedLabel,
) {
  const { getUpsAccessTokenV2 } = await import("../providers/ups/auth");
  let accessToken: string;
  let apiBaseUrl: string;
  try {
    const r = await getUpsAccessTokenV2(ctx);
    accessToken = r.accessToken;
    apiBaseUrl = r.credentials.apiBaseUrl;
  } catch {
    return { success: false };
  }

  const response = await fetch(
    `${apiBaseUrl}/api/track/v1/details/${encodeURIComponent(label.trackingNumber)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    },
  );
  if (!response.ok) return { success: false };

  const data = await readJson(response);
  const pkg = at(data, "trackResponse", "shipment", 0, "package", 0);
  const latestActivity = at(pkg, "activity", 0);
  const description =
    str(at(pkg, "currentStatus", "description")) ??
    str(at(latestActivity, "status", "description")) ??
    "";
  // Stable id from activity date + location + status so re-polls dedupe.
  const activityDate =
    str(at(latestActivity, "date")) ??
    str(at(latestActivity, "gmtDate")) ??
    str(at(pkg, "deliveryDate", 0, "date"));
  const activityTime = str(at(latestActivity, "time")) ?? str(at(latestActivity, "gmtTime")) ?? "";
  const occurredAt = activityDate
    ? new Date(
        `${activityDate.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}${activityTime ? "T" + activityTime.replace(/(\d{2})(\d{2})(\d{2})/, "$1:$2:$3") : ""}`,
      ).getTime() || Date.now()
    : Date.now();
  const location =
    str(at(latestActivity, "location", "address", "city")) ??
    str(at(latestActivity, "location", "address", "postalCode")) ??
    "";

  await ctx.runMutation(internal.shipping.tracking.mutations.recordTrackingEvent, {
    shipmentId: label.shipmentId,
    labelId: label._id,
    eventId: `ups:${label.trackingNumber}:${description}:${location}:${occurredAt}`,
    occurredAt,
    normalizedStatus: normalizeUpsStatus(description),
    carrierStatus: description,
    description,
    location: location || undefined,
    rawMetadata: pkg ?? data,
    receivedVia: "poll",
  });
  return { success: true, status: description };
}

async function syncUsps(
  ctx: ActionCtx,
  label: TrackedLabel,
) {
  const { getUspsAccessTokenV2 } = await import("../providers/usps/auth");
  let accessToken: string;
  let apiBaseUrl: string;
  try {
    const r = await getUspsAccessTokenV2(ctx);
    accessToken = r.accessToken;
    apiBaseUrl = r.credentials.apiBaseUrl;
  } catch {
    return { success: false };
  }

  const response = await fetch(
    `${apiBaseUrl}/tracking/v3/tracking/${encodeURIComponent(label.trackingNumber)}?expand=DETAIL`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    },
  );
  if (!response.ok) return { success: false };

  const data = await readJson(response);
  const event = at(data, "trackingEvents", 0) ?? at(data, "trackingEvent") ?? at(data, "summary");
  const eventType = String(at(event, "eventType") ?? at(data, "status") ?? "");
  const eventTimestamp = at(event, "eventTimestamp");

  await ctx.runMutation(internal.shipping.tracking.mutations.recordTrackingEvent, {
    shipmentId: label.shipmentId,
    labelId: label._id,
    eventId: `usps:${eventType}:${str(eventTimestamp) ?? Date.now()}`,
    occurredAt: timeOf(eventTimestamp) ?? Date.now(),
    normalizedStatus: normalizeUspsStatus(eventType),
    carrierStatus: eventType,
    description: str(at(event, "eventDescription")) ?? eventType,
    rawMetadata: data,
    receivedVia: "poll",
  });
  return { success: true, status: eventType };
}
