"use node";

import { v } from "convex/values";

import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  allProviders,
  applyServiceFilters,
  resolveProvider,
  type ProviderId,
} from "../providers/contract";
import { calculateFlatRate } from "../methods/flatRate";
import { calculateWeightBased, convertWeight } from "../methods/weightBased";
import { calculateDimensional } from "../methods/dimensional";
import { calculatePriceBased } from "../methods/priceBased";
import { calculateQuantityBased } from "../methods/quantityBased";
import { calculateFree } from "../methods/free";
import { calculateLocalPickup } from "../methods/localPickup";
import { calculateLocalDelivery } from "../methods/localDelivery";
import { calculateTableRate } from "../methods/tableRate";
import { rankQuotes } from "./ranking";
import type { NormalizedShippingQuote, PipelineStageTiming } from "./types";
import { computeAddressFingerprint } from "../helpers/addressFingerprint";
import type { RuleContext } from "../rulesEngine/types";
import { packCart, type PackageTemplate, type PackedItemInput } from "../helpers/binPacking";
import { evaluateRule } from "../rulesEngine/evaluator";
import { getShippingIntegrationSettings } from "../helpers/settings";
import { SHIPPING_EVENTS } from "../../events/constants";

/**
 * PRD A7 Rate Calculation Pipeline.
 *
 * Stages:
 *  1. Validate address (A5) — optional, fail-open
 *  2. Match zone (A1)
 *  3. Load applicable methods for zone (B1-B10 configs attached via zone_methods join)
 *  4. Resolve ship-from location (A4)
 *  5. Bin-pack cart into packages (A3)
 *  6. For each enabled method, evaluate rules (A6) and compute rate
 *  7. For live-rate methods, call provider APIs (C1-C5) in parallel with timeout
 *  8. Aggregate + normalize + rank
 *  9. Cache quotes with addressKey/cartKey
 *  10. Return sorted list
 *
 * This is the skeleton. Individual method calculators and provider calls are
 * wired up as B/C layer implementations land. The pipeline structure,
 * diagnostics, and fingerprint/caching flow are complete.
 */

function now() {
  return Date.now();
}

export const calculateRates = action({
  args: {
    sessionToken: v.string(),
    // Optional caller hint — when set, the matching live_rate provider is
    // executed first and bubbled to the top of ranked quotes on ties.
    preferredProvider: v.optional(
      v.union(
        v.literal("shipstation"),
        v.literal("ups"),
        v.literal("usps"),
        v.literal("fedex"),
        v.literal("dhl"),
      ),
    ),
    shippingAddress: v.object({
      line1: v.string(),
      line2: v.optional(v.string()),
      city: v.string(),
      state: v.optional(v.string()),
      postalCode: v.string(),
      countryCode: v.string(),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      company: v.optional(v.string()),
      phone: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const startedAt = now();
    const stages: PipelineStageTiming[] = [];

    const recordStage = (stage: string, start: number, success: boolean, detail?: string) => {
      stages.push({
        stage,
        startedAt: start,
        durationMs: now() - start,
        success,
        detail,
      });
    };

    // Stage 0: Cache hit check. If this session already has persisted
    // ranked quotes with a matching address + cart fingerprint that haven't
    // expired, return them directly without re-rating. Saves carrier round-
    // trips when the user navigates back to the shipping step.
    const cacheStart = now();
    try {
      const prefetchCtx: any = await ctx.runQuery(
        internal.shipping.internals.getRateContextForSession,
        { sessionToken: args.sessionToken },
      );
      if (prefetchCtx?.checkoutSession?._id && prefetchCtx.items) {
        const prefetchAddressKey = computeAddressFingerprint(args.shippingAddress);
        const prefetchCartKey = (prefetchCtx.items as any[])
          .map((i: any) => `${i.productId}:${i.variantId ?? ""}:${i.quantity}`)
          .sort()
          .join(",");
        const cached: any[] | null = await ctx.runQuery(
          internal.shipping.rates.internals.getCachedQuotesForSession,
          {
            checkoutSessionId: prefetchCtx.checkoutSession._id,
            addressKey: prefetchAddressKey,
            cartKey: prefetchCartKey,
          },
        );
        if (cached && cached.length > 0) {
          recordStage("cache_hit", cacheStart, true, `${cached.length} cached quotes`);
          return {
            success: true,
            quotes: cached as NormalizedShippingQuote[],
            matchedZone: null,
            fellBackToManual: false,
            stages,
          };
        }
      }
      recordStage("cache_miss", cacheStart, true, "no valid cached quotes");
    } catch (err) {
      recordStage(
        "cache_miss",
        cacheStart,
        false,
        err instanceof Error ? err.message.slice(0, 200) : String(err),
      );
    }

    // Stage 1: Address validation (A5) — fail-open. Caches a validation
    // fingerprint + normalized address; pipeline continues even on error.
    const addrStart = now();
    try {
      const validateRes: any = await ctx.runAction(
        internal.shipping.addressValidation.actions.validateAddressInternal,
        { address: args.shippingAddress },
      );
      recordStage(
        "validate_address",
        addrStart,
        true,
        `status=${validateRes?.status ?? "unknown"}`,
      );
    } catch (err) {
      recordStage(
        "validate_address",
        addrStart,
        false,
        err instanceof Error ? err.message.slice(0, 200) : String(err),
      );
    }

    // Stage 2: Zone matching.
    const stage2Start = now();
    const zoneMatch = await ctx.runQuery(
      internal.shipping.zones.internals.matchZoneForAddressInternal,
      {
        countryCode: args.shippingAddress.countryCode,
        state: args.shippingAddress.state,
        postalCode: args.shippingAddress.postalCode,
      },
    );
    recordStage(
      "match_zone",
      stage2Start,
      zoneMatch !== null,
      zoneMatch ? `zoneId=${zoneMatch.zone._id} fallback=${zoneMatch.matchedFallback}` : "no zone",
    );

    if (!zoneMatch) {
      await ctx.runMutation(internal.shipping.rates.internals.recordPipelineRun, {
        requestedAt: startedAt,
        totalDurationMs: now() - startedAt,
        fellBackToManual: true,
        totalQuotes: 0,
        stages,
        providerResults: [],
      });
      await ctx.runMutation(internal.shipping.rates.internals.emitRateEvent, {
        eventCode: SHIPPING_EVENTS.RATES_FELL_BACK_TO_MANUAL,
        payload: {
          reason: "no_zone_match",
          countryCode: args.shippingAddress.countryCode,
          postalCode: args.shippingAddress.postalCode,
        },
      });
      return {
        success: true,
        quotes: [] as NormalizedShippingQuote[],
        matchedZone: null,
        fellBackToManual: true,
        stages,
      };
    }

    // Stage 2 preamble: settings + live-rate method filter setup.
    const integrationSettings = await getShippingIntegrationSettings(ctx);
    const PROVIDER_TIMEOUT_MS = Math.max(
      1000,
      Number(
        (integrationSettings as any).liveRateProviderTimeoutMs ?? 5000,
      ),
    );
    const QUOTE_TTL_MS = Math.max(
      30_000,
      Number(integrationSettings.quoteCacheTtlSeconds ?? 300) * 1000,
    );

    const liveRateMethods: any[] = await ctx.runQuery(
      internal.shipping.rates.internals.listLiveRateZoneMethods,
      { zoneId: zoneMatch.zone._id },
    );
    const configuredProviders = new Set(
      liveRateMethods
        .map((m) => m.provider)
        .filter((p): p is string => Boolean(p)),
    );

    const providerResults: Array<{
      provider: string;
      success: boolean;
      quoteCount: number;
      durationMs: number;
      error?: string;
    }> = [];
    const collected: NormalizedShippingQuote[] = [];
    const warnings: string[] = [];

    // Stage 2: resolve cart + pack into real boxes + resolve ship-from
    // BEFORE live-rate provider calls, so every carrier receives the actual
    // packed dimensions/weights and the selected warehouse origin. Without
    // this, provider rates are priced against a placeholder box from the
    // global ship-from — which is the architectural bug Codex flagged.
    const rateContextForMethods: any = await ctx.runQuery(
      internal.shipping.internals.getRateContextForSession,
      { sessionToken: args.sessionToken },
    );
    const cartItems: any[] = (rateContextForMethods?.items ?? []) as any[];
    const totalWeightOzAll = cartItems.reduce((s, i: any) => {
      const w = i.product?.shippingWeightOz ?? 16;
      return s + Math.max(1, w) * (i.quantity ?? 0);
    }, 0);

    // Resolve default ship-from BEFORE package lookup so we can scope the
    // package catalog to the warehouse's location. The same id is reused
    // later for class resolution + rule context.
    let pipelineShipFromLocationId: string | null = null;
    try {
      const loc: any = await ctx.runQuery(
        internal.shipping.shipFromLocations.internals.getDefault,
        {},
      );
      pipelineShipFromLocationId = loc ? String(loc._id) : null;
    } catch {
      // non-critical — fall through to global package catalog
    }

    const packStartPre = now();
    const candidatePackagesPre: any[] = rateContextForMethods
      ? ((await ctx.runQuery(
          internal.shipping.packages.internals.listAvailablePackages,
          pipelineShipFromLocationId
            ? { shipFromLocationId: pipelineShipFromLocationId as any }
            : {},
        )) as any[])
      : [];
    const packTemplatesPre: PackageTemplate[] = candidatePackagesPre
      .filter((p) => p.innerDimensions || p.dimensions)
      .map((p) => ({
        _id: String(p._id),
        label: p.label,
        innerDimensions: p.innerDimensions ?? p.dimensions,
        tareWeight: p.tareWeight ?? 0,
        maxLoadWeight: p.maxLoadWeight,
      }));
    const defaultPkgPre = candidatePackagesPre.find((p) => p.isDefault);
    const defaultPkgIdPre = defaultPkgPre ? String(defaultPkgPre._id) : null;
    const packInputsPre: PackedItemInput[] = cartItems.map((i: any) => ({
      itemId: String(i._id ?? `${i.productId}:${i.variantId ?? ""}`),
      productId: String(i.productId),
      variantId: i.variantId ? String(i.variantId) : undefined,
      quantity: Math.max(1, Number(i.quantity ?? 1)),
      weight: Math.max(1, Number(i.product?.shippingWeightOz ?? 16)),
      dimensions:
        i.product?.shippingLengthIn &&
        i.product?.shippingWidthIn &&
        i.product?.shippingHeightIn
          ? {
              length: Number(i.product.shippingLengthIn),
              width: Number(i.product.shippingWidthIn),
              height: Number(i.product.shippingHeightIn),
            }
          : undefined,
      shipsInOwnBox: Boolean(i.product?.shipsInOwnBox),
      preferredPackageId: i.product?.preferredPackageId
        ? String(i.product.preferredPackageId)
        : undefined,
    }));
    const packResultPre =
      packTemplatesPre.length > 0
        ? packCart(packInputsPre, packTemplatesPre, defaultPkgIdPre)
        : { boxes: [], unfit: packInputsPre };
    const packedProviderPackages =
      packResultPre.boxes.length > 0
        ? packResultPre.boxes.map((b) => ({
            weightOz: b.totalPackageWeight,
            lengthIn: b.outerDimensions.length || undefined,
            widthIn: b.outerDimensions.width || undefined,
            heightIn: b.outerDimensions.height || undefined,
          }))
        : cartItems.length > 0
          ? [{ weightOz: totalWeightOzAll }]
          : undefined;
    if (packResultPre.unfit.length > 0 && packTemplatesPre.length > 0) {
      warnings.push(`${packResultPre.unfit.length} cart line(s) did not fit configured package templates.`);
    }
    if (cartItems.length > 0 && packTemplatesPre.length === 0) {
      warnings.push("No package templates were available; provider rates used weight-only packages.");
    }
    recordStage(
      "pack_cart_for_providers",
      packStartPre,
      true,
      `${packResultPre.boxes.length} boxes`,
    );

    // Stage 2b: Live-rate providers routed through the B10 provider contract.
    // When live_rate zone-methods are configured, each method's provider +
    // optional accountId + serviceFilters drive one call. When no live_rate
    // methods are configured we fan out to every registered provider with
    // no filters (legacy behavior for un-migrated shops).
    type ProviderCall = {
      name: ProviderId;
      run: () => Promise<{ quotes: NormalizedShippingQuote[] }>;
    };

    // Only fan out to all providers as a fallback when the merchant has
    // not configured any live_rate zone-methods AND liveRatesEnabled is
    // true. Otherwise only the configured methods (or none) fire, so the
    // merchant's stated preference is authoritative.
    const liveFallbackEnabled =
      liveRateMethods.length === 0 &&
      integrationSettings.liveRatesEnabled === true;
    const providerCalls: ProviderCall[] =
      liveRateMethods.length > 0
        ? liveRateMethods
            .filter((m) => m.provider)
            .map((m) => {
              const id = m.provider as ProviderId;
              const p = resolveProvider(id);
              return {
                name: id,
                run: async () => {
                  const res = await p.fetchRates(ctx, {
                    sessionToken: args.sessionToken,
                    shippingAddress: args.shippingAddress,
                    packages: packedProviderPackages,
                    accountId: m.accountId ? String(m.accountId) : undefined,
                    serviceFilters: m.serviceFilters ?? undefined,
                    persistQuotes: false,
                  });
                  let quotes = applyServiceFilters(res.quotes, m.serviceFilters);
                  // Zone-method pricingRules — { markupPct?, markupFlatCents?, minCostCents?, maxCostCents?, roundToCents? }
                  if (m.pricingRules && typeof m.pricingRules === "object") {
                    const pr = m.pricingRules;
                    quotes = quotes.map((q) => {
                      let amount = q.amount;
                      if (typeof pr.markupPct === "number")
                        amount = Math.round(amount * (1 + pr.markupPct / 100));
                      if (typeof pr.markupFlatCents === "number")
                        amount += pr.markupFlatCents;
                      if (typeof pr.minCostCents === "number")
                        amount = Math.max(amount, pr.minCostCents);
                      if (typeof pr.maxCostCents === "number")
                        amount = Math.min(amount, pr.maxCostCents);
                      if (
                        typeof pr.roundToCents === "number" &&
                        pr.roundToCents > 0
                      )
                        amount =
                          Math.round(amount / pr.roundToCents) * pr.roundToCents;
                      return { ...q, amount: Math.max(0, amount) };
                    });
                  }
                  // Zone-method presentationRules — { labelOverride?, carrierNameOverride?, sortPriority? }
                  if (m.presentationRules && typeof m.presentationRules === "object") {
                    const pres = m.presentationRules;
                    quotes = quotes.map((q) => ({
                      ...q,
                      serviceName: pres.labelOverride ?? q.serviceName,
                      carrierName: pres.carrierNameOverride ?? q.carrierName,
                    }));
                  }
                  return { quotes };
                },
              };
            })
        : liveFallbackEnabled
          ? allProviders().map((p) => ({
              name: p.id,
              run: async () => {
                const res = await p.fetchRates(ctx, {
                  sessionToken: args.sessionToken,
                  shippingAddress: args.shippingAddress,
                  packages: packedProviderPackages,
                  persistQuotes: false,
                });
                return { quotes: res.quotes };
              },
            }))
          : [];

    // Honor caller preferredProvider — when set, reorder the fan-out so
    // the preferred provider fires first. Parallel execution semantics are
    // unchanged; this just improves rank-tie ordering.
    const filteredProviderCalls = args.preferredProvider
      ? [
          ...providerCalls.filter((p) => p.name === args.preferredProvider),
          ...providerCalls.filter((p) => p.name !== args.preferredProvider),
        ]
      : providerCalls;

    await Promise.all(
      filteredProviderCalls.map(async ({ name, run }) => {
        const start = now();
        try {
          const result = await Promise.race([
            run(),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`${name} timeout`)),
                PROVIDER_TIMEOUT_MS,
              ),
            ),
          ]);
          collected.push(...result.quotes);
          providerResults.push({
            provider: name,
            success: true,
            quoteCount: result.quotes.length,
            durationMs: now() - start,
          });
          recordStage(`provider_${name}`, start, true, `${result.quotes.length} quotes`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // Configuration errors (NOT_FOUND, VALIDATION_ERROR) are expected
          // when a provider isn't set up. Don't surface them as hard failures.
          const isConfigError = /not found|incomplete|missing/i.test(message);
          providerResults.push({
            provider: name,
            success: isConfigError, // not configured = not a failure
            quoteCount: 0,
            durationMs: now() - start,
            error: isConfigError ? "not configured" : message.slice(0, 200),
          });
          recordStage(
            `provider_${name}`,
            start,
            isConfigError,
            isConfigError ? "not configured" : message.slice(0, 200),
          );
          // PRD B10 §5 — hard failures write a durable operational record
          // via updateConnectionHealth so ops can alert on a provider's
          // status without scraping pipeline_runs rows.
          if (!isConfigError) {
            try {
              await ctx.runMutation(
                internal.shipping.internals.updateConnectionHealth,
                {
                  provider: name,
                  status: /timeout/i.test(message) ? "degraded" : "error",
                  lastErrorCode: err instanceof Error && (err as any).code
                    ? String((err as any).code)
                    : "PROVIDER_RATE_ERROR",
                  lastErrorMessage: message.slice(0, 500),
                },
              );
            } catch {
              // best-effort — connection may not exist
            }
          }
        }
      }),
    );

    // Stage 3: method calculators (B1-B9) attached to the matched zone.
    const methodsStart = now();
    try {
      const methods = await ctx.runQuery(
        internal.shipping.rates.internals.listEnabledMethodsForZone,
        { zoneId: zoneMatch.zone._id },
      );
      // Build a minimal cart context for method calculators.
      const rateContextForMethods: any = await ctx.runQuery(
        internal.shipping.internals.getRateContextForSession,
        { sessionToken: args.sessionToken },
      );
      if (rateContextForMethods) {
        const items = (rateContextForMethods.items ?? []) as any[];
        const itemCount = items.reduce((s, i) => s + (i.quantity ?? 0), 0);
        const totalWeightOz = items.reduce((s, i) => {
          const w = i.product?.shippingWeightOz ?? 16;
          return s + Math.max(1, w) * (i.quantity ?? 0);
        }, 0);
        const subtotalAmount =
          Number(rateContextForMethods.cart?.subtotalAmount ?? 0) / 100;
        const discountAmount =
          Number(rateContextForMethods.cart?.discountAmount ?? 0) / 100;
        const subtotalBeforeDiscount = subtotalAmount;
        const subtotalAfterDiscount = Math.max(0, subtotalAmount - discountAmount);
        const currencyCode =
          rateContextForMethods.cart?.currencyCode ?? "USD";
        const addressKey = computeAddressFingerprint(args.shippingAddress);
        const cartKey = items
          .map((i) => `${i.productId}:${i.variantId ?? ""}:${i.quantity}`)
          .sort()
          .join(",");

        // Stage 3a: Bin-pack the cart (PRD A3) so dimensional/carrier methods
        // see real packed boxes instead of a hardcoded placeholder. If no
        // packages are configured, we fall back to a single-box placeholder
        // (merchant hasn't completed A3 setup yet).
        const packStart = now();
        const candidatePackages = (await ctx.runQuery(
          internal.shipping.packages.internals.listAvailablePackages,
          pipelineShipFromLocationId
            ? { shipFromLocationId: pipelineShipFromLocationId as any }
            : {},
        )) as any[];

        const packTemplates: PackageTemplate[] = candidatePackages
          .filter((p) => p.innerDimensions || p.dimensions)
          .map((p) => ({
            _id: String(p._id),
            label: p.label,
            innerDimensions: p.innerDimensions ?? p.dimensions,
            tareWeight: p.tareWeight ?? 0,
            maxLoadWeight: p.maxLoadWeight,
          }));

        const defaultPkg = candidatePackages.find((p) => p.isDefault);
        const defaultPkgId = defaultPkg ? String(defaultPkg._id) : null;

        const packInputs: PackedItemInput[] = items.map((i) => ({
          itemId: String(i._id ?? `${i.productId}:${i.variantId ?? ""}`),
          productId: String(i.productId),
          variantId: i.variantId ? String(i.variantId) : undefined,
          quantity: Math.max(1, Number(i.quantity ?? 1)),
          weight: Math.max(1, Number(i.product?.shippingWeightOz ?? 16)),
          dimensions:
            i.product?.shippingLengthIn &&
            i.product?.shippingWidthIn &&
            i.product?.shippingHeightIn
              ? {
                  length: Number(i.product.shippingLengthIn),
                  width: Number(i.product.shippingWidthIn),
                  height: Number(i.product.shippingHeightIn),
                }
              : undefined,
          shipsInOwnBox: Boolean(i.product?.shipsInOwnBox),
          preferredPackageId: i.product?.preferredPackageId
            ? String(i.product.preferredPackageId)
            : undefined,
        }));

        const packResult =
          packTemplates.length > 0
            ? packCart(packInputs, packTemplates, defaultPkgId)
            : { boxes: [], unfit: packInputs };
        if (packResult.unfit.length > 0 && packTemplates.length > 0) {
          warnings.push(`${packResult.unfit.length} cart line(s) did not fit method package templates.`);
        }

        // No hidden hardcoded production dimensions. If packCart produced
        // boxes, use their real outer dims. Otherwise, dimensional rates
        // operate weight-only (undefined dims signal the calculator to skip
        // DIM weight and use actualWeight).
        const dimensionalPackages =
          packResult.boxes.length > 0
            ? packResult.boxes.map((b) => ({
                lengthIn: b.outerDimensions.length || undefined,
                widthIn: b.outerDimensions.width || undefined,
                heightIn: b.outerDimensions.height || undefined,
                actualWeight: b.totalPackageWeight,
              }))
            : [{ actualWeight: totalWeightOz }];

        recordStage(
          "pack_cart",
          packStart,
          true,
          `${packResult.boxes.length} boxes, ${packResult.unfit.length} unfit`,
        );

        // Stage 3b: resolve shipping classes per cart line (A2). Populates
        // ruleContext.cart.shippingClasses + per-item classId map so class-
        // scoped calculators behave per PRD.
        const classStart = now();
        const classByLineKey: Record<string, string | null> = {};
        let resolvedClasses: string[] = [];
        try {
          const batch: any = await ctx.runQuery(
            internal.shipping.classes.internals.resolveBatch,
            {
              lines: items.map((i: any) => ({
                productId: i.productId,
                variantId: i.variantId ?? undefined,
              })),
            },
          );
          if (batch) {
            for (const [key, classId] of Object.entries(batch)) {
              classByLineKey[key] = (classId as string | null) ?? null;
            }
            resolvedClasses = Array.from(
              new Set(
                (Object.values(batch) as (string | null)[]).filter(
                  (c): c is string => Boolean(c),
                ),
              ),
            );
          }
          recordStage("resolve_classes", classStart, true, `${resolvedClasses.length} classes`);
        } catch (err) {
          recordStage(
            "resolve_classes",
            classStart,
            false,
            err instanceof Error ? err.message.slice(0, 200) : String(err),
          );
        }
        // Build classBreakdown array for per_shipping_class methods.
        const classItemCounts = new Map<string | null, number>();
        for (const i of items) {
          const key = `${i.productId}:${i.variantId ?? ""}`;
          const cls = classByLineKey[key] ?? null;
          classItemCounts.set(
            cls,
            (classItemCounts.get(cls) ?? 0) + (i.quantity ?? 0),
          );
        }
        const classBreakdown = Array.from(classItemCounts.entries()).map(
          ([classId, c]) => ({ classId, itemCount: c }),
        );

        // Stage 3c: resolve the default ship-from location (A4). Carrier
        // rate calls use this location's address as the origin (via
        // getEffectiveShipFrom inside each provider). True multi-origin
        // split shipments (one location per sub-cart) land in a follow-up
        // PRD; v1 routes all items from the single resolved location.
        const locStart = now();
        let shipFromLocationId: string | null = null;
        try {
          const loc: any = await ctx.runQuery(
            internal.shipping.shipFromLocations.internals.getDefault,
            {},
          );
          shipFromLocationId = loc ? String(loc._id) : null;
          recordStage(
            "resolve_ship_from",
            locStart,
            Boolean(loc),
            loc ? `location=${loc.name}` : "no default location",
          );
        } catch (err) {
          recordStage(
            "resolve_ship_from",
            locStart,
            false,
            err instanceof Error ? err.message.slice(0, 200) : String(err),
          );
        }

        // Stage 3d: collect product tags + customer tags so rules/table-rate
        // predicates can fire. Product tags come from the already-enriched
        // cart items; customer tags come from the user's profile when the
        // session is authenticated.
        const productTagSet = new Set<string>();
        for (const item of items) {
          const tags = Array.isArray(item.product?.tags)
            ? item.product.tags
            : Array.isArray(item.product?.productTags)
              ? item.product.productTags
              : [];
          for (const t of tags) if (t) productTagSet.add(String(t));
        }

        const customerTagSet = new Set<string>();
        const userId = rateContextForMethods.checkoutSession?.userId;
        if (userId) {
          try {
            const userTags: string[] = await ctx.runQuery(
              internal.shipping.rates.internals.getUserTags,
              { userId: String(userId) },
            );
            for (const t of userTags) if (t) customerTagSet.add(String(t));
          } catch {
            // non-critical — continue with empty tags
          }
        }

        const ruleContext: RuleContext = {
          cart: {
            subtotalAmount,
            weightOz: totalWeightOz,
            itemCount,
            currencyCode,
            appliedDiscountCode: rateContextForMethods.cart?.appliedDiscountCode,
            shippingClasses: resolvedClasses,
            productIds: items.map((i) => String(i.productId)),
            productTags: Array.from(productTagSet),
          },
          shipping: {
            destinationCountryCode: args.shippingAddress.countryCode,
            destinationPostalCode: args.shippingAddress.postalCode,
            zoneId: String(zoneMatch.zone._id),
            zoneName: zoneMatch.zone.name,
          },
          customer: {
            tags: Array.from(customerTagSet),
            isGuest: !userId,
          },
        };

        for (const { methodType, config } of methods) {
          try {
            // PRD A6 §4 — if the method references a shared rule, evaluate
            // it against the live rule context. Rule evaluation is already
            // embedded in a few calculators (free, table_rate), but shared
            // ruleId gating applies to every method type and must be
            // enforced at the pipeline level.
            if (config.ruleId) {
              const rule: any = await ctx.runQuery(
                internal.shipping.rulesEngine.internals.getById,
                { ruleId: config.ruleId },
              );
              if (rule && rule.isActive !== false && rule.ruleAST) {
                const passes = evaluateRule(rule.ruleAST, ruleContext);
                if (!passes) continue;
              }
            }
            let methodQuotes: NormalizedShippingQuote[] = [];
            switch (methodType) {
              case "flat_rate":
                methodQuotes = calculateFlatRate(config, {
                  currencyCode,
                  itemCount,
                  classBreakdown,
                  addressKey,
                  cartKey,
                });
                break;
              case "weight_based":
                // PRD B2 — calculator expects the weight in the method's
                // configured unit. Pipeline accumulates in oz; convert.
                methodQuotes = calculateWeightBased(config, {
                  currencyCode,
                  totalWeight: convertWeight(
                    totalWeightOz,
                    "oz",
                    (config as any).weightUnit ?? "oz",
                  ),
                  classes: resolvedClasses,
                  addressKey,
                  cartKey,
                });
                break;
              case "dimensional":
                methodQuotes = calculateDimensional(config, {
                  currencyCode,
                  packages: dimensionalPackages,
                  classes: resolvedClasses,
                  matchedZoneId: String(zoneMatch.zone._id),
                  addressKey,
                  cartKey,
                });
                break;
              case "price_based":
                methodQuotes = calculatePriceBased(config, {
                  currencyCode,
                  subtotalBeforeDiscount,
                  subtotalAfterDiscount,
                  addressKey,
                  cartKey,
                });
                break;
              case "quantity_based":
                methodQuotes = calculateQuantityBased(config, {
                  currencyCode,
                  totalItems: itemCount,
                  totalLineItems: items.length,
                  classBreakdown,
                  addressKey,
                  cartKey,
                });
                break;
              case "free":
                methodQuotes = calculateFree(config, {
                  currencyCode,
                  subtotalAmount,
                  appliedDiscountCode:
                    rateContextForMethods.cart?.appliedDiscountCode,
                  shippingClasses: resolvedClasses,
                  customerTags: ruleContext.customer.tags,
                  addressKey,
                  cartKey,
                  ruleContext,
                });
                break;
              case "local_pickup": {
                // PRD B7 — only offer pickup when at least one of the
                // method's allowed locations is still active + pickupEnabled.
                const activeLocs: any[] = await ctx.runQuery(
                  internal.shipping.shipFromLocations.internals.listActivePickupLocations,
                  {},
                );
                const activeLocIds = activeLocs.map((l) => String(l._id));
                methodQuotes = calculateLocalPickup(config, {
                  currencyCode,
                  availablePickupLocationIds: activeLocIds,
                  addressKey,
                  cartKey,
                });
                break;
              }
              case "local_delivery": {
                // Resolve origin geocode from the ship-from location (if
                // any) and destination geocode from the cached address
                // validation (if any). Without both, radius mode short-
                // circuits to "no match" inside the calculator.
                let originGeocode: { lat: number; lng: number } | undefined;
                let destinationGeocode:
                  | { lat: number; lng: number }
                  | undefined;
                if (pipelineShipFromLocationId) {
                  try {
                    const loc: any = await ctx.runQuery(
                      internal.shipping.shipFromLocations.internals.getById,
                      { locationId: pipelineShipFromLocationId as any },
                    );
                    if (
                      typeof loc?.geocode?.lat === "number" &&
                      typeof loc?.geocode?.lng === "number"
                    ) {
                      originGeocode = {
                        lat: loc.geocode.lat,
                        lng: loc.geocode.lng,
                      };
                    }
                  } catch {
                    // leave undefined — calculator handles missing geocode
                  }
                }
                try {
                  const cached: any = await ctx.runQuery(
                    internal.shipping.addressValidation.queries
                      .getValidationByFingerprintInternal,
                    { fingerprint: addressKey },
                  );
                  if (
                    typeof cached?.geocode?.lat === "number" &&
                    typeof cached?.geocode?.lng === "number"
                  ) {
                    destinationGeocode = {
                      lat: cached.geocode.lat,
                      lng: cached.geocode.lng,
                    };
                  }
                } catch {
                  // no cached validation — leave undefined
                }
                methodQuotes = calculateLocalDelivery(config, {
                  currencyCode,
                  subtotalAmount,
                  destinationPostalCode: args.shippingAddress.postalCode,
                  originGeocode,
                  destinationGeocode,
                  addressKey,
                  cartKey,
                });
                break;
              }
              case "table_rate":
                methodQuotes = calculateTableRate(config, {
                  currencyCode,
                  totalWeightOz,
                  itemCount,
                  subtotalAmount,
                  addressKey,
                  cartKey,
                  ruleContext,
                });
                break;
            }
            collected.push(...methodQuotes);
          } catch (err) {
            console.warn(
              `[pipeline] method ${methodType} failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
      recordStage("methods", methodsStart, true, `${methods.length} methods`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordStage("methods", methodsStart, false, message.slice(0, 200));
    }

    const ranked = rankQuotes(collected);

    // Persist ranked quotes into `commerce_shipping_rate_quotes` so the
    // checkout picker (website) and checkout validator can find them. Without
    // this write, `listCheckoutQuotes` returns nothing and the selected
    // method is rejected as "not available" at finalize.
    const addressKey = computeAddressFingerprint(args.shippingAddress);
    const rateContextForPersist: any = await ctx.runQuery(
      internal.shipping.internals.getRateContextForSession,
      { sessionToken: args.sessionToken },
    );
    if (rateContextForPersist?.checkoutSession?._id) {
      const items = (rateContextForPersist.items ?? []) as any[];
      const cartKey = items
        .map((i: any) => `${i.productId}:${i.variantId ?? ""}:${i.quantity}`)
        .sort()
        .join(",");
      try {
        const expiresAt = now() + QUOTE_TTL_MS;
        await ctx.runMutation(
          internal.shipping.internals.replaceCheckoutQuotes,
          {
            checkoutSessionId: rateContextForPersist.checkoutSession._id,
            quotes: ranked.map((q) => ({ ...q, expiresAt })),
            addressKey,
            cartKey,
          },
        );
      } catch (err) {
        recordStage(
          "persist_quotes",
          now(),
          false,
          err instanceof Error ? err.message.slice(0, 200) : String(err),
        );
      }
    }

    // PRD A7 §7 — build zero-quote reasons when no ranked quotes survived.
    const zeroQuoteReasons: string[] = [];
    if (ranked.length === 0) {
      if (providerResults.every((p) => p.quoteCount === 0)) {
        zeroQuoteReasons.push("no_provider_quotes");
      }
      if (providerResults.some((p) => !p.success)) {
        zeroQuoteReasons.push("provider_errors");
      }
      if (liveRateMethods.length === 0 && !liveFallbackEnabled) {
        zeroQuoteReasons.push("no_live_rate_methods_configured");
      }
    }
    const selectedPackageIds = packResultPre.boxes
      .map((b) => b.packageId)
      .filter((id): id is string => Boolean(id));

    await ctx.runMutation(internal.shipping.rates.internals.recordPipelineRun, {
      checkoutSessionId: rateContextForPersist?.checkoutSession?._id,
      requestedAt: startedAt,
      totalDurationMs: now() - startedAt,
      matchedZoneId: zoneMatch.zone._id,
      matchedZoneName: zoneMatch.zone.name,
      fellBackToManual: false,
      totalQuotes: ranked.length,
      cacheHit: false,
      shipFromLocationId:
        (pipelineShipFromLocationId as any) ?? undefined,
      selectedPackageIds,
      warnings: warnings.length > 0 ? warnings : undefined,
      zeroQuoteReasons: zeroQuoteReasons.length > 0 ? zeroQuoteReasons : undefined,
      requestContext: {
        shippingAddress: args.shippingAddress,
        preferredProvider: args.preferredProvider,
      },
      stages,
      providerResults,
      addressKey,
      cartKey: (rateContextForPersist?.items ?? [])
        .map((i: any) => `${i.productId}:${i.variantId ?? ""}:${i.quantity}`)
        .sort()
        .join(","),
    });

    await ctx.runMutation(internal.shipping.rates.internals.emitRateEvent, {
      eventCode:
        ranked.length > 0
          ? SHIPPING_EVENTS.RATES_CALCULATED
          : SHIPPING_EVENTS.RATES_FAILED,
      payload: {
        zoneId: zoneMatch.zone._id,
        zoneName: zoneMatch.zone.name,
        totalQuotes: ranked.length,
        providerBreakdown: providerResults.map((p) => ({
          provider: p.provider,
          success: p.success,
          quoteCount: p.quoteCount,
          durationMs: p.durationMs,
        })),
        durationMs: now() - startedAt,
      },
    });

    return {
      success: true,
      quotes: ranked,
      matchedZone: zoneMatch.zone,
      fellBackToManual: false,
      stages,
    };
  },
});
