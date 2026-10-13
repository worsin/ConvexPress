"use node";
/**
 * Commerce Tax — Stripe Tax provider (Wave 12.5).
 *
 * When `commerce.payments.taxProviderMode === "stripe"`, checkout +
 * renewal paths call this action to compute tax via Stripe Tax. On
 * error (network, unsupported region, mis-config), the action returns
 * `{ provider: "rules", fallback: true }` so callers seamlessly drop
 * back to the in-house rules engine.
 *
 * The payload-shaping helpers are exported for unit tests without
 * touching a real Stripe account.
 */

import { v } from "convex/values";

import type Stripe from "stripe";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveServiceKeyAsync } from "../helpers/serviceKeys";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A Stripe error's `code` (or `type`), for the fallback reason. */
export function stripeErrorReason(err: unknown): string {
  if (isRecord(err)) {
    if (typeof err.code === "string") return err.code;
    if (typeof err.type === "string") return err.type;
  }
  return "stripe_error";
}

export type StripeTaxLine = {
  amount: number;
  reference: string;
  taxCode?: string;
  taxBehavior?: "exclusive" | "inclusive";
};

export type StripeTaxAddress = {
  country: string;
  state?: string;
  postalCode?: string;
  city?: string;
  line1?: string;
};

export type StripeTaxResult = {
  taxAmount: number;
  taxableAmount: number;
  breakdown: Array<{
    taxClass: string;
    taxableAmount: number;
    taxAmount: number;
    taxRate: number;
    jurisdiction?: string;
  }>;
  provider: "stripe" | "rules";
  fallback?: boolean;
  reason?: string;
};

/** Build Stripe Tax `calculations.create` payload. Pure — unit-testable. */
export function buildStripeTaxPayload(
  address: StripeTaxAddress,
  lines: StripeTaxLine[],
  currency = "usd",
): Stripe.Tax.CalculationCreateParams {
  return {
    currency,
    customer_details: {
      address: {
        country: address.country,
        state: address.state,
        postal_code: address.postalCode,
        city: address.city,
        line1: address.line1,
      },
      address_source: "shipping",
    },
    line_items: lines.map((line) => ({
      amount: line.amount,
      reference: line.reference,
      tax_code: line.taxCode ?? "txcd_99999999",
      tax_behavior: line.taxBehavior ?? "exclusive",
    })),
  };
}

/** Parse Stripe Tax calculation response → our StripeTaxResult. Pure. */
export function parseStripeTaxResponse(calc: unknown): StripeTaxResult {
  const response = isRecord(calc) ? calc : {};
  const taxAmount = Number(response.tax_amount_exclusive ?? 0);
  const taxableAmount = Number(response.amount_total ?? 0) - taxAmount;
  const lineItems = response.line_items;
  const breakdownLines: unknown[] = isRecord(lineItems) && Array.isArray(lineItems.data)
    ? lineItems.data
    : Array.isArray(lineItems) ? lineItems : [];
  const breakdown = breakdownLines.map((entry) => {
    const line = isRecord(entry) ? entry : {};
    const amount = Number(line.amount ?? 0);
    const tax = Number(line.amount_tax ?? 0);
    const rate = amount > 0 ? tax / amount : 0;
    const firstBreakdown = Array.isArray(line.tax_breakdown) ? line.tax_breakdown[0] : undefined;
    const jurisdiction = isRecord(firstBreakdown) && isRecord(firstBreakdown.jurisdiction) ? firstBreakdown.jurisdiction.display_name : undefined;
    return {
      taxClass: typeof line.tax_code === "string" ? line.tax_code : "standard",
      taxableAmount: amount,
      taxAmount: tax,
      taxRate: rate,
      jurisdiction: typeof jurisdiction === "string" ? jurisdiction : undefined,
    };
  });
  return {
    taxAmount,
    taxableAmount,
    breakdown,
    provider: "stripe",
  };
}

async function getStripeSecretKey(ctx: ActionCtx): Promise<string | undefined> {
  const settings = await ctx.runQuery(internal.commerce.settingsInternals.getPaymentSettings, {});
  return await resolveServiceKeyAsync(settings, "stripeSecretKey", "STRIPE_SECRET_KEY");
}

async function isStripeTaxMode(ctx: ActionCtx): Promise<boolean> {
  const settings = await ctx.runQuery(internal.commerce.settingsInternals.getPaymentSettings, {});
  return settings.taxProviderMode === "stripe";
}

export const calculateViaStripe = internalAction({
  args: {
    currency: v.string(),
    address: v.object({
      country: v.string(),
      state: v.optional(v.string()),
      postalCode: v.optional(v.string()),
      city: v.optional(v.string()),
      line1: v.optional(v.string()),
    }),
    lines: v.array(
      v.object({
        amount: v.number(),
        reference: v.string(),
        taxCode: v.optional(v.string()),
        taxBehavior: v.optional(
          v.union(v.literal("exclusive"), v.literal("inclusive")),
        ),
      }),
    ),
  },
  returns: v.object({
    taxAmount: v.number(),
    taxableAmount: v.number(),
    breakdown: v.array(v.object({
      taxClass: v.string(),
      taxableAmount: v.number(),
      taxAmount: v.number(),
      taxRate: v.number(),
      jurisdiction: v.optional(v.string()),
    })),
    provider: v.union(v.literal("stripe"), v.literal("rules")),
    fallback: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<StripeTaxResult> => {
    const inMode = await isStripeTaxMode(ctx);
    if (!inMode) {
      return {
        taxAmount: 0,
        taxableAmount: 0,
        breakdown: [],
        provider: "rules",
        fallback: true,
        reason: "tax_provider_mode_is_rules",
      };
    }
    const stripeKey = await getStripeSecretKey(ctx);
    if (!stripeKey) {
      return {
        taxAmount: 0,
        taxableAmount: 0,
        breakdown: [],
        provider: "rules",
        fallback: true,
        reason: "stripe_not_configured",
      };
    }
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey);
      const payload = buildStripeTaxPayload(
        args.address,
        args.lines,
        args.currency,
      );
      const calc = await stripe.tax.calculations.create(payload);
      return parseStripeTaxResponse(calc);
    } catch (err) {
      console.error(
        "[taxStripe] Stripe Tax call failed, falling back to rules:",
        err instanceof Error ? err.message : err,
      );
      return {
        taxAmount: 0,
        taxableAmount: 0,
        breakdown: [],
        provider: "rules",
        fallback: true,
        reason: stripeErrorReason(err),
      };
    }
  },
});
