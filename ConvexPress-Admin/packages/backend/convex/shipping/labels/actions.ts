"use node";

/**
 * PRD 7.1 — v2 label purchase actions.
 *
 * Delegates the actual carrier API call to the existing legacy actions
 * (which already handle ShipStation/UPS/FedEx label purchase correctly),
 * then records the result into the v2 `commerce_shipment_labels` table so
 * downstream v2 systems (tracking, manifests, batch operations) work.
 *
 * PRD 7.3 — rate reconfirmation: before purchasing, verify the selected
 * quote's addressKey/cartKey still match the current order's address and
 * cart. Throws STALE_SHIPPING_RATE if not. (Reuses the same fingerprint
 * mechanism as checkout.)
 */

import { v, ConvexError } from "convex/values";

import { action, internalAction } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal, api } from "../../_generated/api";
import { at, readJson, str } from "../helpers/json";
import { getDecryptedProviderPayload } from "../providers/_shared/credentials";
import { getUpsAccessTokenV2 } from "../providers/ups/auth";
import { getFedexAccessTokenV2 } from "../providers/fedex/auth";
import { resolveProvider } from "../providers/contract";
import { assertShippingProvider } from "../helpers";

/**
 * Carrier-side void for a label the `voidLabel` mutation already authorized.
 * Internal: it performs no permission check of its own (it runs from the
 * scheduler, without a user identity).
 */
export const voidLabelWithCarrier = internalAction({
  args: { labelId: v.id("commerce_shipment_labels") },
  returns: v.object({ voided: v.boolean(), refundPending: v.boolean() }),
  handler: async (ctx, args) => {
    const label = await ctx.runQuery(
      internal.shipping.labels.internals.getLabelById,
      { labelId: args.labelId },
    );
    if (!label) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Label not found." });
    }
    if (label.voidedAt) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Label already voided.",
      });
    }

    // Per-carrier void window enforcement (PRD D1):
    //   UPS  ~24h
    //   FedEx ~14d
    //   ShipStation: varies — let provider reject
    const ageMs = Date.now() - label.purchasedAt;
    const VOID_WINDOWS_MS: Record<string, number> = {
      ups: 24 * 60 * 60 * 1000,
      fedex: 14 * 24 * 60 * 60 * 1000,
      shipstation: 30 * 24 * 60 * 60 * 1000,
    };
    const window = VOID_WINDOWS_MS[label.provider?.toLowerCase() ?? ""];
    if (window && ageMs > window) {
      throw new ConvexError({
        code: "VOID_WINDOW_EXPIRED",
        message: `Void window for ${label.provider} (${Math.round(window / (24 * 60 * 60 * 1000))}d) has passed.`,
      });
    }

    let voidResult: { voided: boolean; refundPending: boolean } = {
      voided: false,
      refundPending: false,
    };

    if (label.provider === "shipstation") {
      const credsPayload = await getDecryptedProviderPayload(ctx, "shipstation");
      const apiKey = credsPayload.apiKey;
      const apiBaseUrl = (credsPayload.apiBaseUrl || "https://api.shipengine.com").replace(
        /\/+$/,
        "",
      );
      if (!apiKey) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "ShipStation API key not configured.",
        });
      }

      if (!label.externalLabelId) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "This label has no ShipStation label id to void.",
        });
      }
      const response = await fetch(
        `${apiBaseUrl}/v1/labels/${encodeURIComponent(label.externalLabelId)}/void`,
        {
          method: "PUT",
          headers: { "API-Key": apiKey, Accept: "application/json" },
        },
      );
      if (!response.ok) {
        const body = await response.text();
        throw new ConvexError({
          code: "VOID_FAILED",
          message: body.slice(0, 500) || `Void failed (${response.status})`,
        });
      }
      const data = await readJson(response);
      voidResult = {
        voided: data.approved === true || data.status === "voided",
        refundPending: data.approved === true,
      };
    } else if (label.provider === "ups") {
      const { accessToken, credentials } = await getUpsAccessTokenV2(ctx);
      // UPS voids by shipment identification number, recorded on the shipment row.
      const shipmentContext = await ctx.runQuery(
        internal.shipping.internals.getShipmentForTracking,
        { shipmentId: label.shipmentId },
      );
      const upsShipmentId = shipmentContext?.shipment.externalShipmentId ?? label.externalLabelId;
      if (!upsShipmentId) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "This label has no UPS shipment id to void.",
        });
      }
      const response = await fetch(
        `${credentials.apiBaseUrl}/api/shipments/v2409/void/cancel/${encodeURIComponent(
          upsShipmentId,
        )}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            "x-merchant-id": credentials.accountNumber,
          },
        },
      );
      if (!response.ok) {
        const body = await response.text();
        throw new ConvexError({
          code: "VOID_FAILED",
          message: body.slice(0, 500) || `UPS void failed (${response.status})`,
        });
      }
      voidResult = { voided: true, refundPending: true };
    } else if (label.provider === "fedex") {
      const { accessToken, credentials } = await getFedexAccessTokenV2(ctx);
      const response = await fetch(
        `${credentials.apiBaseUrl}/ship/v1/shipments/cancel`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "x-customer-transaction-id": `cp-void-${Date.now()}`,
          },
          body: JSON.stringify({
            accountNumber: { value: credentials.accountNumber },
            trackingNumber: label.trackingNumber,
          }),
        },
      );
      if (!response.ok) {
        const body = await response.text();
        throw new ConvexError({
          code: "VOID_FAILED",
          message: body.slice(0, 500) || `FedEx void failed (${response.status})`,
        });
      }
      const data = await readJson(response);
      const cancelled = at(data, "output", "cancelledShipment") === true;
      voidResult = {
        voided: cancelled,
        refundPending: cancelled,
      };
    } else {
      throw new ConvexError({
        code: "NOT_IMPLEMENTED",
        message: `Direct ${label.provider} void not supported. USPS/DHL label operations are not yet implemented in v2.`,
      });
    }

    if (!voidResult.voided) {
      throw new ConvexError({
        code: "VOID_FAILED",
        message: `Carrier did not confirm that the ${label.provider} label was voided.`,
      });
    }

    // Only mark the label voided after the carrier confirms the void.
    await ctx.runMutation(
      internal.shipping.labels.mutations.markLabelVoided,
      {
        labelId: args.labelId,
        refundPending: voidResult.refundPending,
      },
    );

    return voidResult;
  },
});

/**
 * PRD D1 §2 — batch label purchase. Iterates a set of orderIds and fires
 * purchaseLabel for each, aggregating successes + failures. Intended for
 * admin bulk workflows ("mark 50 orders as shipped"). Fails soft: a single
 * order's failure doesn't abort the batch.
 */
export const batchPurchaseLabels = action({
  args: {
    orderIds: v.array(v.id("commerce_orders")),
    provider: v.optional(
      v.union(
        v.literal("shipstation"),
        v.literal("ups"),
        v.literal("fedex"),
      ),
    ),
  },
  returns: v.object({
    total: v.number(),
    succeeded: v.number(),
    failed: v.number(),
    results: v.array(v.object({
      orderId: v.id("commerce_orders"),
      success: v.boolean(),
      labelIds: v.optional(v.array(v.id("commerce_shipment_labels"))),
      errorCode: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
    })),
  }),
  handler: async (ctx, args) => {
    const results: Array<{
      orderId: Id<"commerce_orders">;
      success: boolean;
      labelIds?: Id<"commerce_shipment_labels">[];
      errorCode?: string;
      errorMessage?: string;
    }> = [];
    for (const orderId of args.orderIds) {
      try {
        const r = await ctx.runAction(
          api.shipping.labels.actions.purchaseLabel,
          {
            orderId,
            provider: args.provider,
            idempotencyKey: `batch:${orderId}`,
          },
        );
        results.push({
          orderId,
          success: r.success,
          labelIds: r.labelIds,
        });
      } catch (err) {
        const data: unknown = err instanceof ConvexError ? err.data : undefined;
        results.push({
          orderId,
          success: false,
          errorCode: str(at(data, "code")),
          errorMessage:
            str(at(data, "message")) ??
            (err instanceof Error ? err.message : String(err)),
        });
      }
    }
    const succeeded = results.filter((r) => r.success).length;
    return {
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      results,
    };
  },
});

export const purchaseLabel = action({
  args: {
    orderId: v.id("commerce_orders"),
    provider: v.optional(
      v.union(
        v.literal("shipstation"),
        v.literal("ups"),
        v.literal("fedex"),
      ),
    ),
    /**
     * PRD D1 — caller-supplied idempotency key. When present, a repeat
     * call returns the previously purchased label without hitting the
     * carrier. Lets retries from the client side not double-buy.
     */
    idempotencyKey: v.optional(v.string()),
    rateId: v.optional(v.string()),
  },
  returns: v.union(v.object({
    success: v.boolean(),
    idempotent: v.boolean(),
    labelUrl: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    externalLabelId: v.optional(v.string()),
    labelIds: v.array(v.id("commerce_shipment_labels")),
    packageCount: v.number(),
  }), v.object({
    success: v.boolean(),
    labelUrl: v.string(),
    trackingNumber: v.string(),
    externalLabelId: v.string(),
    labelIds: v.array(v.id("commerce_shipment_labels")),
    packageCount: v.number(),
    idempotent: v.optional(v.null()),
  })),
  handler: async (ctx, args) => {
    // 1. Idempotency pre-check — if a prior call with the same key already
    // recorded a label for this order, short-circuit.
    if (args.idempotencyKey) {
      const existing = await ctx.runQuery(
        internal.shipping.labels.internals.findByIdempotencyKey,
        {
          orderId: args.orderId,
          idempotencyKey: args.idempotencyKey,
        },
      );
      if (existing) {
        return {
          success: true,
          idempotent: true,
          labelUrl: existing.labelUrl,
          trackingNumber: existing.trackingNumber,
          externalLabelId: existing.externalLabelId,
          labelIds: [existing._id],
          packageCount: 1,
        };
      }
    }
    // 2. Load order context.
    const order = await ctx.runQuery(
      internal.shipping.labels.internals.getOrderById,
      { orderId: args.orderId },
    );
    if (!order) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Order not found." });
    }
    const provider: string =
      args.provider ?? order.shippingProvider ?? "shipstation";
    assertShippingProvider(provider);

    // 2. PRD 7.3 — rate reconfirmation (money safety).
    // If the order has a stored quote fingerprint, verify it against the
    // current address/cart before firing the carrier purchase. Mismatch =
    // stale quote -> reject so merchant rates again.
    const storedAddressKey = order.shippingQuoteAddressKey;
    const storedCartKey = order.shippingQuoteCartKey;
    const storedExpiresAt = order.shippingQuoteExpiresAt;
    if (storedExpiresAt && storedExpiresAt < Date.now()) {
      throw new ConvexError({
        code: "STALE_SHIPPING_RATE",
        message:
          "The shipping quote for this order has expired. Refresh rates before purchasing a label.",
      });
    }
    if (storedAddressKey && storedCartKey) {
      const current = await ctx.runQuery(
        internal.shipping.labels.internals.getCurrentQuoteFingerprint,
        { orderId: args.orderId },
      );
      if (
        current &&
        (current.addressKey !== storedAddressKey ||
          current.cartKey !== storedCartKey)
      ) {
        throw new ConvexError({
          code: "STALE_SHIPPING_RATE",
          message:
            "Order address or cart has changed since this rate was quoted. Refresh rates before purchasing a label.",
        });
      }
    }

    // 3. Delegate the carrier call to the legacy action that knows the API.
    let labelResult: {
      labelUrl: string;
      trackingNumber: string;
      externalLabelId: string;
      shipmentId: Id<"commerce_shipments"> | undefined;
      labelCost: number;
      labelCurrency: string;
      carrierCode: string;
      serviceCode: string;
    };

    // Route through the B10 provider contract instead of hitting the legacy
    // dispatcher directly. The provider's `purchaseLabel` is responsible
    // for its carrier call; today ShipStation/UPS/FedEx bridge into the
    // legacy implementation, but callers see a stable contract.
    const providerEntry = resolveProvider(provider);
    if (!providerEntry.capabilities.labels) {
      throw new ConvexError({
        code: "NOT_SUPPORTED",
        message: `${providerEntry.displayName} does not support label purchase.`,
      });
    }
    const r = await providerEntry.purchaseLabel(ctx, {
      orderId: args.orderId,
      rateId:
        args.rateId ??
        str(at(order.shippingQuoteRaw, "rate_id")) ??
        str(at(order.shippingQuoteRaw, "rateId")),
    });
    if (!r.success) {
      throw new ConvexError({
        code: r.errorCode ?? "LABEL_PURCHASE_FAILED",
        message: r.errorMessage ?? "Carrier label purchase failed.",
      });
    }
    labelResult = {
      labelUrl: r.labelUrl ?? "",
      trackingNumber: r.trackingNumber ?? "",
      externalLabelId: r.externalLabelId ?? "",
      shipmentId: r.shipmentId,
      labelCost: Number(r.labelCost ?? 0),
      labelCurrency: r.labelCurrency ?? "USD",
      carrierCode: r.carrierCode ?? "",
      serviceCode: r.serviceCode ?? "",
    };

    // 4a. Best-effort: fetch the carrier-returned label PDF and store it in
    // Convex _storage so reprints work offline even if the carrier URL expires.
    async function tryStoreLabelPdf(url: string | undefined): Promise<Id<"_storage"> | null> {
      if (!url) return null;
      try {
        const pdf = await fetch(url);
        if (!pdf.ok) return null;
        const blob = await pdf.blob();
        return await ctx.storage.store(blob);
      } catch {
        return null;
      }
    }

    // 4. Record into v2 commerce_shipment_labels. Multi-package shipments:
    // carrier responses that include a `packages[]` array produce one label
    // row per package, each with its own tracking number, external label id,
    // and monotonically increasing packageIndex.
    const recordedLabelIds: Id<"commerce_shipment_labels">[] = [];
    if (labelResult.shipmentId) {
      const packageList = r.packages ?? [];

      if (packageList.length > 1) {
        for (let i = 0; i < packageList.length; i++) {
          const p = packageList[i];
          const pkgTracking = p.trackingNumber ?? labelResult.trackingNumber;
          const pkgExternalId = p.externalLabelId ?? `${labelResult.externalLabelId}:${i}`;
          const pkgUrl = p.labelUrl ?? labelResult.labelUrl;
          const pkgCost = Number(p.labelCost ?? labelResult.labelCost / packageList.length);
          const storageId = await tryStoreLabelPdf(pkgUrl);
          const id = await ctx.runMutation(
            internal.shipping.labels.mutations.recordPurchasedLabel,
            {
              shipmentId: labelResult.shipmentId,
              orderId: args.orderId,
              packageIndex: i,
              provider,
              carrierCode: labelResult.carrierCode || undefined,
              serviceCode: labelResult.serviceCode || undefined,
              trackingNumber: pkgTracking,
              externalLabelId: pkgExternalId,
              labelUrl: pkgUrl,
              labelFileStorageId: storageId ?? undefined,
              labelCost: Math.round(pkgCost * 100),
              labelCurrency: labelResult.labelCurrency,
              idempotencyKey: args.idempotencyKey,
            },
          );
          if (id) recordedLabelIds.push(id);
        }
      } else if (labelResult.trackingNumber) {
        const storageId = await tryStoreLabelPdf(labelResult.labelUrl);
        const id = await ctx.runMutation(
          internal.shipping.labels.mutations.recordPurchasedLabel,
          {
            shipmentId: labelResult.shipmentId,
            orderId: args.orderId,
            packageIndex: 0,
            provider,
            carrierCode: labelResult.carrierCode || undefined,
            serviceCode: labelResult.serviceCode || undefined,
            trackingNumber: labelResult.trackingNumber,
            externalLabelId: labelResult.externalLabelId,
            labelUrl: labelResult.labelUrl,
            labelFileStorageId: storageId ?? undefined,
            labelCost: Math.round(Number(labelResult.labelCost) * 100),
            labelCurrency: labelResult.labelCurrency,
            idempotencyKey: args.idempotencyKey,
          },
        );
        if (id) recordedLabelIds.push(id);
      }
    }

    return {
      success: true,
      labelUrl: labelResult.labelUrl,
      trackingNumber: labelResult.trackingNumber,
      externalLabelId: labelResult.externalLabelId,
      labelIds: recordedLabelIds,
      packageCount: recordedLabelIds.length,
    };
  },
});
