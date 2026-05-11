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

import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { getDecryptedProviderPayload } from "../providers/_shared/credentials";
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
      if (!label.trackingNumber || !label.provider) continue;

      const syncStart = Date.now();
      let result: { success: boolean; status?: string } = { success: false };
      let errorMessage: string | undefined;
      try {
        result = await fetchTrackingForLabel(ctx, label);
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

async function fetchTrackingForLabel(
  ctx: any,
  label: {
    _id: any;
    shipmentId: any;
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
  ctx: any,
  label: { _id: any; shipmentId: any; trackingNumber: string; carrierCode?: string },
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

  const data = (await response.json()) as any;
  const code = String(data.status_code ?? "").toUpperCase();
  if (!code) return { success: false };

  await ctx.runMutation(internal.shipping.tracking.mutations.recordTrackingEvent, {
    shipmentId: label.shipmentId,
    labelId: label._id,
    eventId: `shipstation:${code}:${data.actual_delivery_date ?? Date.now()}`,
    occurredAt: data.actual_delivery_date
      ? new Date(data.actual_delivery_date).getTime()
      : Date.now(),
    normalizedStatus: normalizeShipStationStatus(code),
    carrierStatus: data.status_description ?? code,
    description: data.status_description,
    rawMetadata: data,
    receivedVia: "poll",
  });
  return { success: true, status: code };
}

async function syncFedex(
  ctx: any,
  label: { _id: any; shipmentId: any; trackingNumber: string },
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

  const data = (await response.json()) as any;
  const trackResult = data?.output?.completeTrackResults?.[0]?.trackResults?.[0];
  if (!trackResult) return { success: false };

  const code = String(trackResult.latestStatusDetail?.code ?? "");
  // Stable event id: prefer FedEx scanEvent/dateAndTime when present so a
  // re-poll of the same delivery state doesn't create duplicate rows.
  const latestScan = trackResult.scanEvents?.[0];
  const occurredAt = latestScan?.date
    ? new Date(latestScan.date).getTime()
    : trackResult.latestStatusDetail?.ancillaryDetails?.[0]?.reasonDescription
      ? Date.now()
      : Date.now();
  const scanSignature =
    latestScan?.eventType ??
    latestScan?.eventDescription ??
    trackResult.latestStatusDetail?.description ??
    code;
  await ctx.runMutation(internal.shipping.tracking.mutations.recordTrackingEvent, {
    shipmentId: label.shipmentId,
    labelId: label._id,
    eventId: `fedex:${label.trackingNumber}:${scanSignature}:${occurredAt}`,
    occurredAt,
    normalizedStatus: normalizeFedexStatus(code),
    carrierStatus: trackResult.latestStatusDetail?.statusByLocale ?? code,
    description: trackResult.latestStatusDetail?.description,
    rawMetadata: trackResult,
    receivedVia: "poll",
  });
  return { success: true, status: code };
}

async function syncUps(
  ctx: any,
  label: { _id: any; shipmentId: any; trackingNumber: string },
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

  const data = (await response.json()) as any;
  const pkg = data?.trackResponse?.shipment?.[0]?.package?.[0];
  const latestActivity = pkg?.activity?.[0];
  const description =
    pkg?.currentStatus?.description ??
    latestActivity?.status?.description ??
    "";
  // Stable id from activity date + location + status so re-polls dedupe.
  const activityDate =
    latestActivity?.date ??
    latestActivity?.gmtDate ??
    pkg?.deliveryDate?.[0]?.date;
  const activityTime = latestActivity?.time ?? latestActivity?.gmtTime ?? "";
  const occurredAt = activityDate
    ? new Date(
        `${String(activityDate).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}${activityTime ? "T" + activityTime.replace(/(\d{2})(\d{2})(\d{2})/, "$1:$2:$3") : ""}`,
      ).getTime() || Date.now()
    : Date.now();
  const location =
    latestActivity?.location?.address?.city ??
    latestActivity?.location?.address?.postalCode ??
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
  ctx: any,
  label: { _id: any; shipmentId: any; trackingNumber: string },
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

  const data = (await response.json()) as any;
  const event = data?.trackingEvents?.[0] ?? data?.trackingEvent ?? data?.summary;
  const eventType = String(event?.eventType ?? data?.status ?? "");

  await ctx.runMutation(internal.shipping.tracking.mutations.recordTrackingEvent, {
    shipmentId: label.shipmentId,
    labelId: label._id,
    eventId: `usps:${eventType}:${event?.eventTimestamp ?? Date.now()}`,
    occurredAt: event?.eventTimestamp ? new Date(event.eventTimestamp).getTime() : Date.now(),
    normalizedStatus: normalizeUspsStatus(eventType),
    carrierStatus: eventType,
    description: event?.eventDescription ?? eventType,
    rawMetadata: data,
    receivedVia: "poll",
  });
  return { success: true, status: eventType };
}
