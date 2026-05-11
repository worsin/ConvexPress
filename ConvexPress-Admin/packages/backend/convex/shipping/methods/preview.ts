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
  handler: async (ctx, args) => {
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

    try {
      switch (methodType) {
        case "flat_rate":
          return {
            quotes: calculateFlatRate(config, {
              currencyCode,
              itemCount: sample.itemCount,
              classBreakdown,
              addressKey,
              cartKey,
            }),
          };
        case "weight_based":
          return {
            quotes: calculateWeightBased(config, {
              currencyCode,
              totalWeight: convertWeight(
                sample.totalWeightOz,
                "oz",
                config.weightUnit ?? "oz",
              ),
              classes: sample.shippingClasses ?? [],
              addressKey,
              cartKey,
            }),
          };
        case "dimensional":
          return {
            quotes: calculateDimensional(config, {
              currencyCode,
              packages: [{ actualWeight: sample.totalWeightOz }],
              classes: sample.shippingClasses ?? [],
              addressKey,
              cartKey,
            }),
          };
        case "price_based":
          return {
            quotes: calculatePriceBased(config, {
              currencyCode,
              subtotalBeforeDiscount: sample.subtotalAmount,
              subtotalAfterDiscount: sample.subtotalAmount,
              addressKey,
              cartKey,
            }),
          };
        case "quantity_based":
          return {
            quotes: calculateQuantityBased(config, {
              currencyCode,
              totalItems: sample.itemCount,
              totalLineItems: sample.itemCount,
              classBreakdown,
              addressKey,
              cartKey,
            }),
          };
        case "free":
          return {
            quotes: calculateFree(config, {
              currencyCode,
              subtotalAmount: sample.subtotalAmount,
              appliedDiscountCode: sample.appliedDiscountCode,
              shippingClasses: sample.shippingClasses ?? [],
              customerTags: sample.customerTags ?? [],
              addressKey,
              cartKey,
              ruleContext,
            }),
          };
        case "local_pickup":
          return {
            quotes: calculateLocalPickup(config, {
              currencyCode,
              availablePickupLocationIds: config.allowedPickupLocationIds ?? [],
              addressKey,
              cartKey,
            }),
          };
        case "local_delivery":
          return {
            quotes: calculateLocalDelivery(config, {
              currencyCode,
              subtotalAmount: sample.subtotalAmount,
              destinationPostalCode: sample.destinationPostalCode,
              addressKey,
              cartKey,
            }),
          };
        case "table_rate":
          return {
            quotes: calculateTableRate(config, {
              currencyCode,
              totalWeightOz: sample.totalWeightOz,
              itemCount: sample.itemCount,
              subtotalAmount: sample.subtotalAmount,
              addressKey,
              cartKey,
              ruleContext,
            }),
          };
      }
    } catch (err) {
      return {
        quotes: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
    return { quotes: [] };
  },
});
