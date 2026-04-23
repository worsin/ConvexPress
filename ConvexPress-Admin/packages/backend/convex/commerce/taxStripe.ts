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

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveServiceKey } from "../helpers/serviceKeys";

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
): Record<string, unknown> {
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
export function parseStripeTaxResponse(calc: any): StripeTaxResult {
  const taxAmount = Number(calc?.tax_amount_exclusive ?? 0);
  const taxableAmount = Number(calc?.amount_total ?? 0) - taxAmount;
  const breakdownLines: any[] = calc?.line_items?.data ?? calc?.line_items ?? [];
  const breakdown = breakdownLines.map((line: any) => {
    const amount = Number(line?.amount ?? 0);
    const tax = Number(line?.amount_tax ?? 0);
    const rate = amount > 0 ? tax / amount : 0;
    return {
      taxClass: line?.tax_code ?? "standard",
      taxableAmount: amount,
      taxAmount: tax,
      taxRate: rate,
      jurisdiction: line?.tax_breakdown?.[0]?.jurisdiction?.display_name,
    };
  });
  return {
    taxAmount,
    taxableAmount,
    breakdown,
    provider: "stripe",
  };
}

async function getStripeSecretKey(ctx: any): Promise<string | undefined> {
  const settings = await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: "commerce.payments" },
  );
  const values = (settings?.values ?? settings) as
    | Record<string, unknown>
    | null
    | undefined;
  return resolveServiceKey(values, "stripeSecretKey", "STRIPE_SECRET_KEY");
}

async function isStripeTaxMode(ctx: any): Promise<boolean> {
  const settings = await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: "commerce.payments" },
  );
  const values = (settings?.values ?? settings) as any;
  return values?.taxProviderMode === "stripe";
}

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const calculateViaStripe = internalAction({
  args: {
    currency: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    address: v.object({
      country: v.string(),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      state: v.optional(v.string()),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      postalCode: v.optional(v.string()),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      city: v.optional(v.string()),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      line1: v.optional(v.string()),
    }),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    lines: v.array(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.object({
        amount: v.number(),
        reference: v.string(),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        taxCode: v.optional(v.string()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        taxBehavior: v.optional(
          // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
          v.union(v.literal("exclusive"), v.literal("inclusive")),
        ),
      }),
    ),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
      const calc = await (stripe as any).tax.calculations.create(payload);
      return parseStripeTaxResponse(calc);
    } catch (err: any) {
      console.error(
        "[taxStripe] Stripe Tax call failed, falling back to rules:",
        err?.message ?? err,
      );
      return {
        taxAmount: 0,
        taxableAmount: 0,
        breakdown: [],
        provider: "rules",
        fallback: true,
        reason: err?.code ?? err?.type ?? "stripe_error",
      };
    }
  },
});
