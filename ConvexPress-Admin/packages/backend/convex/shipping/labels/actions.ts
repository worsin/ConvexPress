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

import { action } from "../../_generated/server";
import { internal, api } from "../../_generated/api";
import { getDecryptedProviderPayload } from "../providers/_shared/credentials";
import { getUpsAccessTokenV2 } from "../providers/ups/auth";
import { getFedexAccessTokenV2 } from "../providers/fedex/auth";
import { resolveProvider } from "../providers/contract";

export const voidLabelWithCarrier = action({
  args: { labelId: v.id("commerce_shipment_labels") },
  handler: async (ctx, args) => {
    const label: any = await ctx.runQuery(
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
      const data = (await response.json()) as any;
      voidResult = {
        voided: data.approved === true || data.status === "voided",
        refundPending: data.approved === true,
      };
    } else if (label.provider === "ups") {
      const { accessToken, credentials } = await getUpsAccessTokenV2(ctx);
      const response = await fetch(
        `${credentials.apiBaseUrl}/api/shipments/v2409/void/cancel/${encodeURIComponent(
          label.externalShipmentId ?? label.externalLabelId,
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
      const data = (await response.json()) as any;
      voidResult = {
        voided: data?.output?.cancelledShipment === true,
        refundPending: data?.output?.cancelledShipment === true,
      };
    } else {
      throw new ConvexError({
        code: "NOT_IMPLEMENTED",
        message: `Direct ${label.provider} void not supported. USPS/DHL label operations are not yet implemented in v2.`,
      });
    }

    // Always mark the label voided in our system, even if carrier rejected
    // (gives the merchant a clean audit trail and triggers retry workflows).
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
  handler: async (ctx, args) => {
    const results: Array<{
      orderId: string;
      success: boolean;
      labelIds?: any[];
      errorCode?: string;
      errorMessage?: string;
    }> = [];
    for (const orderId of args.orderIds) {
      try {
        const r: any = await ctx.runAction(
          (api as any).shipping.labels.actions.purchaseLabel,
          {
            orderId,
            provider: args.provider,
            idempotencyKey: `batch:${orderId}`,
          },
        );
        results.push({
          orderId,
          success: Boolean(r?.success),
          labelIds: r?.labelIds,
        });
      } catch (err: any) {
        results.push({
          orderId,
          success: false,
          errorCode: err?.data?.code,
          errorMessage:
            err?.data?.message ??
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
  },
  handler: async (ctx, args) => {
    // 1. Idempotency pre-check — if a prior call with the same key already
    // recorded a label for this order, short-circuit.
    if (args.idempotencyKey) {
      const existing: any = await ctx.runQuery(
        (internal.shipping.labels.internals as any).findByIdempotencyKey,
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
    const order: any = await ctx.runQuery(
      internal.shipping.internals.getOrderForLabelInternal
        ? (internal.shipping.internals as any).getOrderForLabelInternal
        : (internal.shipping.labels.internals as any).getOrderById,
      { orderId: args.orderId },
    );
    if (!order) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Order not found." });
    }
    const provider =
      args.provider ?? order.shippingProvider ?? "shipstation";

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
        (internal as any).shipping.labels.internals.getCurrentQuoteFingerprint,
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
      shipmentId: any;
      labelCost: number;
      labelCurrency: string;
      carrierCode: string;
      serviceCode: string;
    };

    // Route through the B10 provider contract instead of hitting the legacy
    // dispatcher directly. The provider's `purchaseLabel` is responsible
    // for its carrier call; today ShipStation/UPS/FedEx bridge into the
    // legacy implementation, but callers see a stable contract.
    const providerEntry = resolveProvider(provider as any);
    if (!providerEntry.capabilities.labels) {
      throw new ConvexError({
        code: "NOT_SUPPORTED",
        message: `${providerEntry.displayName} does not support label purchase.`,
      });
    }
    const r = await providerEntry.purchaseLabel(ctx, { orderId: args.orderId });
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
    async function tryStoreLabelPdf(url: string | undefined): Promise<any | null> {
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
    const recordedLabelIds: any[] = [];
    if (labelResult.shipmentId) {
      const packageList: any[] = Array.isArray(r.packages)
        ? r.packages
        : Array.isArray(r.shipment?.packages)
          ? r.shipment.packages
          : [];

      if (packageList.length > 1) {
        for (let i = 0; i < packageList.length; i++) {
          const p = packageList[i];
          const pkgTracking =
            p.tracking_number ?? p.trackingNumber ?? labelResult.trackingNumber;
          const pkgExternalId =
            p.label_id ?? p.externalLabelId ?? `${labelResult.externalLabelId}:${i}`;
          const pkgUrl =
            p.label_download?.pdf ??
            p.label_download?.href ??
            p.labelUrl ??
            labelResult.labelUrl;
          const pkgCost = Number(
            p.shipment_cost?.amount ??
              p.labelCost ??
              labelResult.labelCost / packageList.length,
          );
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
