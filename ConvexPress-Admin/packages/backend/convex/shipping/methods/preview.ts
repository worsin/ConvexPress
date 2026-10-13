/**
 * PRD B1-B9 §7 — per-method preview endpoint.
 *
 * Takes a method config + sample cart context and runs only that method's
 * calculator, returning the would-be quote. Used by the admin method editor
 * to show "what would this produce for a cart weighing 5 lb at $50?" without
 * creating an order.
 */

import { v } from "convex/values";

import { query } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";
import { calculateFlatRate } from "./flatRate";
import { calculateWeightBased, convertWeight } from "./weightBased";
import { calculateDimensional } from "./dimensional";
import { calculatePriceBased } from "./priceBased";
import { calculateQuantityBased } from "./quantityBased";
import { calculateFree } from "./free";
import { calculateLocalPickup } from "./localPickup";
import { calculateLocalDelivery } from "./localDelivery";
import { calculateTableRate } from "./tableRate";
import type { RuleContext } from "../rulesEngine/types";
import type { NormalizedShippingQuote } from "../rates/types";
import { withoutRawQuote, type PipelineQuote } from "../rates/quoteOutput";

export const previewMethod = query({
  args: {
    methodType: v.union(
      v.literal("flat_rate"),
      v.literal("weight_based"),
      v.literal("dimensional"),
      v.literal("price_based"),
      v.literal("quantity_based"),
      v.literal("free"),
      v.literal("local_pickup"),
      v.literal("local_delivery"),
      v.literal("table_rate"),
    ),
    config: v.any(),
    sample: v.object({
      itemCount: v.number(),
      totalWeightOz: v.number(),
      subtotalAmount: v.number(),
      currencyCode: v.optional(v.string()),
      shippingClasses: v.optional(v.array(v.string())),
      customerTags: v.optional(v.array(v.string())),
      destinationPostalCode: v.optional(v.string()),
      destinationCountryCode: v.optional(v.string()),
      appliedDiscountCode: v.optional(v.string()),
    }),
  },
  returns: v.object({
    quotes: v.array(v.object({
      quoteKey: v.string(),
      provider: v.union(v.literal("shipstation"), v.literal("ups"), v.literal("usps"), v.literal("fedex"), v.literal("dhl"), v.literal("manual")),
      carrierCode: v.string(),
      carrierName: v.string(),
      serviceCode: v.string(),
      serviceName: v.string(),
      amount: v.number(),
      currency: v.string(),
      estimatedDaysMin: v.optional(v.number()),
      estimatedDaysMax: v.optional(v.number()),
      deliveryDateEstimated: v.optional(v.number()),
      isCheapest: v.boolean(),
      isFastest: v.boolean(),
      isBestValue: v.boolean(),
      accountId: v.optional(v.id("shipping_provider_accounts")),
      origin: v.optional(v.object({
        shipFromLocationId: v.optional(v.id("commerce_ship_from_locations")),
        name: v.optional(v.string()),
        company: v.optional(v.string()),
        phone: v.optional(v.string()),
        line2: v.optional(v.string()),
        state: v.optional(v.string()),
        line1: v.string(),
        city: v.string(),
        postalCode: v.string(),
        countryCode: v.string(),
      })),
      packages: v.optional(v.array(v.object({
        lengthIn: v.optional(v.number()),
        widthIn: v.optional(v.number()),
        heightIn: v.optional(v.number()),
        weightOz: v.number(),
      }))),
      addressKey: v.optional(v.string()),
      cartKey: v.optional(v.string()),
      expiresAt: v.number(),
    })),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ quotes: PipelineQuote[]; error?: string }> => {
    await requireCan(ctx, "shipping.methods.read");
    const { methodType, config, sample } = args;
    const currencyCode = sample.currencyCode ?? "USD";
    const classBreakdown = [{ classId: null, itemCount: sample.itemCount }];
    const ruleContext: RuleContext = {
      cart: {
        subtotalAmount: sample.subtotalAmount,
        weightOz: sample.totalWeightOz,
        itemCount: sample.itemCount,
        currencyCode,
        appliedDiscountCode: sample.appliedDiscountCode,
        shippingClasses: sample.shippingClasses ?? [],
        productIds: [],
        productTags: [],
      },
      shipping: {
        destinationCountryCode: sample.destinationCountryCode ?? "US",
        destinationPostalCode: sample.destinationPostalCode ?? "",
        zoneId: String(config.zoneId ?? ""),
        zoneName: "preview",
      },
      customer: { tags: sample.customerTags ?? [], isGuest: true },
    };
    const addressKey = "preview";
    const cartKey = "preview";

    const run = (): NormalizedShippingQuote[] => {
      switch (methodType) {
        case "flat_rate":
          return calculateFlatRate(config, {
              currencyCode,
              itemCount: sample.itemCount,
              classBreakdown,
              addressKey,
              cartKey,
            });
        case "weight_based":
          return calculateWeightBased(config, {
              currencyCode,
              totalWeight: convertWeight(
                sample.totalWeightOz,
                "oz",
                config.weightUnit ?? "oz",
              ),
              classes: sample.shippingClasses ?? [],
              addressKey,
              cartKey,
            });
        case "dimensional":
          return calculateDimensional(config, {
              currencyCode,
              packages: [{ actualWeight: sample.totalWeightOz }],
              classes: sample.shippingClasses ?? [],
              addressKey,
              cartKey,
            });
        case "price_based":
          return calculatePriceBased(config, {
              currencyCode,
              subtotalBeforeDiscount: sample.subtotalAmount,
              subtotalAfterDiscount: sample.subtotalAmount,
              addressKey,
              cartKey,
            });
        case "quantity_based":
          return calculateQuantityBased(config, {
              currencyCode,
              totalItems: sample.itemCount,
              totalLineItems: sample.itemCount,
              classBreakdown,
              addressKey,
              cartKey,
            });
        case "free":
          return calculateFree(config, {
              currencyCode,
              subtotalAmount: sample.subtotalAmount,
              appliedDiscountCode: sample.appliedDiscountCode,
              shippingClasses: sample.shippingClasses ?? [],
              customerTags: sample.customerTags ?? [],
              addressKey,
              cartKey,
              ruleContext,
            });
        case "local_pickup":
          return calculateLocalPickup(config, {
              currencyCode,
              availablePickupLocationIds: config.allowedPickupLocationIds ?? [],
              addressKey,
              cartKey,
            });
        case "local_delivery":
          return calculateLocalDelivery(config, {
              currencyCode,
              subtotalAmount: sample.subtotalAmount,
              destinationPostalCode: sample.destinationPostalCode,
              addressKey,
              cartKey,
            });
        case "table_rate":
          return calculateTableRate(config, {
              currencyCode,
              totalWeightOz: sample.totalWeightOz,
              itemCount: sample.itemCount,
              subtotalAmount: sample.subtotalAmount,
              addressKey,
              cartKey,
              ruleContext,
            });
      }
    };
    try {
      return { quotes: run().map(withoutRawQuote) };
    } catch (err) {
      return {
        quotes: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});
