"use node";

/**
 * PRD 7.11 — manifest auto-close cron entry point.
 * PRD 7.12 — provider submission per carrier.
 *
 * The cron job (in convex/crons.ts) calls autoCloseDueManifests hourly.
 * For each manifest past its carrier's cutoff time, this action:
 *   1. Submits the manifest to the carrier's API
 *   2. Records the submission result on the manifest row
 *   3. Marks the manifest "submitted" or "failed"
 *
 * Carrier endpoints:
 *   ShipStation: POST /v1/manifests
 *   UPS:         End-of-Day API (legacy support deferred)
 *   FedEx:       Ground Manifest API (legacy support deferred)
 *   USPS:        SCAN form via ShipStation (no direct USPS endpoint)
 *   DHL:         Not supported
 */

import { v } from "convex/values";

import { internalAction, type ActionCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { getDecryptedProviderPayload } from "../providers/_shared/credentials";
import { getUpsAccessTokenV2 } from "../providers/ups/auth";
import { getFedexAccessTokenV2 } from "../providers/fedex/auth";
import { at, str } from "../helpers/json";

type Manifest = Doc<"commerce_shipment_manifests">;
type ManifestSubmission = { success: boolean; externalManifestId?: string; errorMessage?: string };

/**
 * PRD D3 §2 — submit a single manifest to the carrier. Invoked by
 * `closeManifest` via the scheduler right after the row flips to closed.
 */
export const submitOneManifest = internalAction({
  args: { manifestId: v.id("commerce_shipment_manifests") },
  returns: v.object({
    success: v.boolean(),
    externalManifestId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const manifest = await ctx.runQuery(
      internal.shipping.manifests.internals.getManifestById,
      { manifestId: args.manifestId },
    );
    if (!manifest) return { success: false };
    try {
      const result = await submitManifestToCarrier(ctx, manifest);
      await ctx.runMutation(
        internal.shipping.manifests.mutations.markManifestSubmitted,
        {
          manifestId: manifest._id,
          externalManifestId: result.externalManifestId,
          success: result.success,
          errorMessage: result.errorMessage,
        },
      );
      return result;
    } catch (err) {
      await ctx.runMutation(
        internal.shipping.manifests.mutations.markManifestSubmitted,
        {
          manifestId: manifest._id,
          success: false,
          errorMessage:
            err instanceof Error ? err.message.slice(0, 500) : String(err),
        },
      );
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export const autoCloseDueManifests = internalAction({
  args: {},
  returns: v.object({ closed: v.number(), failed: v.number(), total: v.number() }),
  handler: async (ctx) => {
    const manifests = await ctx.runQuery(
      internal.shipping.manifests.internals.listManifestsDueForAutoClose,
      {},
    );

    let closed = 0;
    let failed = 0;

    for (const manifest of manifests) {
      try {
        const result = await submitManifestToCarrier(ctx, manifest);
        await ctx.runMutation(
          internal.shipping.manifests.mutations.markManifestSubmitted,
          {
            manifestId: manifest._id,
            externalManifestId: result.externalManifestId,
            success: result.success,
            errorMessage: result.errorMessage,
          },
        );
        if (result.success) closed += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
        await ctx.runMutation(
          internal.shipping.manifests.mutations.markManifestSubmitted,
          {
            manifestId: manifest._id,
            success: false,
            errorMessage:
              err instanceof Error ? err.message.slice(0, 500) : String(err),
          },
        );
      }
    }

    return { closed, failed, total: manifests.length };
  },
});

async function submitManifestToCarrier(
  ctx: ActionCtx,
  manifest: Manifest,
): Promise<ManifestSubmission> {
  const carrierCode = (manifest.carrierCode ?? "").toLowerCase();

  if (manifest.provider === "shipstation" || carrierCode === "usps") {
    return await submitShipStationManifest(ctx, manifest);
  }
  if (manifest.provider === "ups") {
    return await submitUpsManifest(ctx, manifest);
  }
  if (manifest.provider === "fedex") {
    return await submitFedexManifest(ctx, manifest);
  }

  // DHL: no end-of-day manifest API (per DHL PRD, rates-only integration).
  return {
    success: false,
    errorMessage: `Manifest submission for ${manifest.provider}/${carrierCode} is not supported.`,
  };
}

async function submitUpsManifest(
  ctx: ActionCtx,
  manifest: Manifest,
): Promise<ManifestSubmission> {
  try {
    const { accessToken, credentials } = await getUpsAccessTokenV2(ctx);
    // Pull the ship-from location so UPS knows where to pick up. UPS
    // Pickup API requires a populated PickupAddress — sending an empty
    // object caused prior requests to fail silently with 400s.
    const location = await ctx.runQuery(
      internal.shipping.shipFromLocations.internals.getById,
      { locationId: manifest.shipFromLocationId },
    );
    if (!location || !location.address) {
      return {
        success: false,
        errorMessage:
          "UPS manifest requires a configured ship-from location with a complete address.",
      };
    }
    // UPS Pickup Request / Daily Pickup — /api/shipments/v2409/pickup
    const response = await fetch(
      `${credentials.apiBaseUrl}/api/shipments/v2409/pickup`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-merchant-id": credentials.accountNumber,
          transId: `cp-manifest-${Date.now()}`,
          transactionSrc: "convexpress",
        },
        body: JSON.stringify({
          PickupCreationRequest: {
            RatePickupIndicator: "N",
            Shipper: {
              Account: { AccountNumber: credentials.accountNumber },
            },
            PickupDateInfo: {
              PickupDate: manifest.manifestDate.replace(/-/g, ""),
              ReadyTime: "0900",
              CloseTime: "1700",
            },
            PickupAddress: {
              CompanyName: location.address.companyName || location.name || "Shipper",
              ContactName: location.address.contactName || location.name || "Shipper",
              AddressLine: [location.address.line1, location.address.line2].filter(Boolean),
              City: location.address.city,
              StateProvince: location.address.state,
              PostalCode: location.address.postalCode,
              CountryCode: location.address.countryCode,
              Phone: { Number: location.address.phone || "0000000000" },
            },
            PickupPiece: [
              {
                ServiceCode: String(manifest.carrierCode).toUpperCase() === "UPS"
                  ? "003"
                  : String(manifest.carrierCode),
                Quantity: String(manifest.totalPackages || manifest.labelIds.length || 1),
                DestinationCountryCode:
                  location.address.countryCode ?? "US",
                ContainerCode: "01",
              },
            ],
            TotalWeight: { Weight: "1.0", UnitOfMeasurement: "LBS" },
            PaymentMethod: "01",
          },
        }),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      return { success: false, errorMessage: body.slice(0, 500) };
    }
    const data: unknown = await response.json();
    const prn = str(at(data, "PickupCreationResponse", "PRN"));
    return {
      success: Boolean(prn),
      externalManifestId: prn || undefined,
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err),
    };
  }
}

async function submitFedexManifest(
  ctx: ActionCtx,
  manifest: Manifest,
): Promise<ManifestSubmission> {
  try {
    const { accessToken, credentials } = await getFedexAccessTokenV2(ctx);
    const location = await ctx.runQuery(
      internal.shipping.shipFromLocations.internals.getById,
      { locationId: manifest.shipFromLocationId },
    );
    if (!location || !location.address) {
      return {
        success: false,
        errorMessage:
          "FedEx close requires a configured ship-from location with a complete address.",
      };
    }
    // FedEx Close API — /ship/v1/closings/today
    const response = await fetch(
      `${credentials.apiBaseUrl}/ship/v1/closings/today`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-customer-transaction-id": `cp-manifest-${manifest._id}-${Date.now()}`,
        },
        body: JSON.stringify({
          accountNumber: { value: credentials.accountNumber },
          closeShipmentRequest: {
            closeDate: manifest.manifestDate,
            carrierCode: (manifest.carrierCode || "FDXE").toUpperCase(),
            shipperAddress: {
              streetLines: [location.address.line1, location.address.line2].filter(Boolean),
              city: location.address.city,
              stateOrProvinceCode: location.address.state,
              postalCode: location.address.postalCode,
              countryCode: location.address.countryCode,
            },
            shipperContact: {
              personName: location.address.contactName || location.name || "Shipper",
              companyName: location.address.companyName || location.name || "Shipper",
              phoneNumber: location.address.phone || "0000000000",
            },
          },
        }),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      return { success: false, errorMessage: body.slice(0, 500) };
    }
    const data: unknown = await response.json();
    const manifestId =
      str(at(data, "output", "manifestData", 0, "manifestId")) ??
      str(at(data, "output", "transactionId"));
    return {
      success: true,
      externalManifestId: manifestId || undefined,
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err),
    };
  }
}

async function submitShipStationManifest(
  ctx: ActionCtx,
  manifest: Manifest,
): Promise<ManifestSubmission> {
  let apiKey: string | undefined;
  let apiBaseUrl = "https://api.shipengine.com";
  try {
    const creds = await getDecryptedProviderPayload(ctx, "shipstation");
    apiKey = creds.apiKey;
    apiBaseUrl = (creds.apiBaseUrl || apiBaseUrl).replace(/\/+$/, "");
  } catch (err) {
    return {
      success: false,
      errorMessage: err instanceof Error ? err.message : "Credentials unavailable.",
    };
  }
  if (!apiKey) {
    return { success: false, errorMessage: "ShipStation API key missing." };
  }

  // ShipEngine accepts label_ids OR shipment_ids. We use externalLabelId
  // from each label record.
  const labelIds: string[] = [];
  for (const labelId of manifest.labelIds) {
    const label = await ctx.runQuery(
      internal.shipping.labels.internals.getLabelById,
      { labelId },
    );
    if (label?.externalLabelId) labelIds.push(label.externalLabelId);
  }
  if (labelIds.length === 0) {
    return { success: false, errorMessage: "No labels with external IDs." };
  }

  const response = await fetch(`${apiBaseUrl}/v1/manifests`, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      label_ids: labelIds,
      ship_date: manifest.manifestDate,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { success: false, errorMessage: body.slice(0, 500) };
  }

  const data: unknown = await response.json();
  const externalManifestId = str(at(data, "manifest_id")) ?? str(at(data, 0, "manifest_id"));
  return {
    success: true,
    externalManifestId: externalManifestId || undefined,
  };
}
