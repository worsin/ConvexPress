"use node";

import type { Infer } from "convex/values";
import { action, internalAction, type ActionCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { computeAddressFingerprint } from "../helpers/addressFingerprint";
import { at, list, readJson, str, type JsonObject } from "../helpers/json";
import { addressInputValidator, validateAddressArgs } from "./validators";

import { v } from "convex/values";
type AddressInput = Infer<typeof addressInputValidator>;
type ValidationRow = Doc<"commerce_address_validations">;

/** What callers learn about an address: the verdict, never the carrier's raw payload. */
export type AddressValidationResult = {
  fromCache: boolean;
  fingerprint: string;
  provider: ValidationRow["provider"];
  status: ValidationRow["status"];
  normalizedAddress?: AddressInput;
  isResidential?: boolean;
  deliveryPoint?: string;
  warnings?: string[];
};

/** Cached rows store addresses untyped; only a complete address is reported back. */
function storedAddress(value: unknown): AddressInput | undefined {
  const line1 = str(at(value, "line1"));
  const city = str(at(value, "city"));
  const postalCode = str(at(value, "postalCode"));
  const countryCode = str(at(value, "countryCode"));
  if (line1 === undefined || city === undefined || postalCode === undefined || countryCode === undefined) return undefined;
  const optional = (key: string) => {
    const field = at(value, key);
    return typeof field === "string" ? field : undefined;
  };
  return {
    line1,
    line2: optional("line2"),
    city,
    state: optional("state"),
    postalCode,
    countryCode,
    firstName: optional("firstName"),
    lastName: optional("lastName"),
    company: optional("company"),
    phone: optional("phone"),
  };
}

function cachedResult(row: ValidationRow): AddressValidationResult {
  return {
    fromCache: true,
    fingerprint: row.fingerprint,
    provider: row.provider,
    status: row.status,
    normalizedAddress: storedAddress(row.normalizedAddress),
    isResidential: row.isResidential,
    deliveryPoint: row.deliveryPoint,
    warnings: row.warnings,
  };
}

type ProviderAttempt = {
  provider: "usps" | "smartystreets" | "google" | "skip";
  attempted: boolean;
  success: boolean;
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
  skippedReason?: string;
};

async function runValidateAddress(
  ctx: ActionCtx,
  args: { address: AddressInput; force?: boolean },
): Promise<AddressValidationResult> {
  const fingerprint = computeAddressFingerprint(args.address);

  if (!args.force) {
    const cached = await ctx.runQuery(
      internal.shipping.addressValidation.queries
        .getValidationByFingerprintInternal,
      { fingerprint },
    );
    if (cached) {
      return cachedResult(cached);
    }
  }

  // Provider chain with structured diagnostics. Each candidate records an
  // attempt even when skipped; admins can read `validationDiagnostics` on
  // the row to see exactly which provider chain fired and why each step
  // short-circuited. Real concrete providers land in their C-layer PRDs.
  const diagnostics: ProviderAttempt[] = [];
  const chainStart = Date.now();

  // USPS (A5 §5.1 priority 1) — real call via /addresses/v3/address.
  const uspsStart = Date.now();
  try {
    const uspsResult = await tryUspsValidate(ctx, args.address);
    diagnostics.push({
      provider: "usps",
      attempted: true,
      success: uspsResult.success,
      durationMs: Date.now() - uspsStart,
      errorCode: uspsResult.errorCode,
      errorMessage: uspsResult.errorMessage,
      skippedReason: uspsResult.skippedReason,
    });
    if (uspsResult.success && uspsResult.normalizedAddress && uspsResult.status) {
      const result = {
        fingerprint,
        provider: "usps" as const,
        status: uspsResult.status,
        inputAddress: args.address,
        normalizedAddress: uspsResult.normalizedAddress,
        isResidential: uspsResult.isResidential,
        deliveryPoint: uspsResult.deliveryPoint,
        warnings: uspsResult.warnings,
        rawResponse: uspsResult.rawResponse,
        validationDiagnostics: {
          chainDurationMs: Date.now() - chainStart,
          attempts: diagnostics,
        },
      };
      await ctx.runMutation(
        internal.shipping.addressValidation.mutations.recordValidation,
        result,
      );
      return {
        fromCache: false,
        fingerprint,
        provider: result.provider,
        status: result.status,
        normalizedAddress: result.normalizedAddress,
        isResidential: result.isResidential,
        deliveryPoint: result.deliveryPoint,
        warnings: result.warnings,
      };
    }
  } catch (err) {
    diagnostics.push({
      provider: "usps",
      attempted: true,
      success: false,
      durationMs: Date.now() - uspsStart,
      errorMessage: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
  }

  // SmartyStreets (§5.1 priority 2) — deferred.
  diagnostics.push({
    provider: "smartystreets",
    attempted: false,
    success: false,
    durationMs: 0,
    skippedReason: "smartystreets_not_configured",
  });
  // Google (§5.1 priority 3) — deferred.
  diagnostics.push({
    provider: "google",
    attempted: false,
    success: false,
    durationMs: 0,
    skippedReason: "google_geocode_not_configured",
  });

  const status: "skipped" | "unconfirmed" = diagnostics.every(
    (d) => d.skippedReason || !d.attempted,
  )
    ? "skipped"
    : "unconfirmed";

  const result = {
    fingerprint,
    provider: "skip" as const,
    status,
    inputAddress: args.address,
    normalizedAddress: args.address,
    isResidential: undefined,
    warnings: [
      "No address validation provider returned a definitive result. Fail-open policy applied.",
    ],
    validationDiagnostics: {
      chainDurationMs: Date.now() - chainStart,
      attempts: diagnostics,
    },
  };

  await ctx.runMutation(
    internal.shipping.addressValidation.mutations.recordValidation,
    result,
  );

  return {
    fromCache: false,
    fingerprint,
    provider: result.provider,
    status: result.status,
    normalizedAddress: result.normalizedAddress,
    warnings: result.warnings,
  };
}

type UspsValidateResult = {
  success: boolean;
  status?: "valid" | "corrected" | "invalid" | "ambiguous" | "unsupported_country";
  normalizedAddress?: AddressInput;
  isResidential?: boolean;
  deliveryPoint?: string;
  warnings?: string[];
  rawResponse?: JsonObject;
  errorCode?: string;
  errorMessage?: string;
  skippedReason?: string;
};

async function tryUspsValidate(
  ctx: ActionCtx,
  address: AddressInput,
): Promise<UspsValidateResult> {
  // USPS only supports US domestic. Non-US → skip, don't error.
  if (String(address.countryCode ?? "").toUpperCase() !== "US") {
    return { success: false, skippedReason: "non_us_country" };
  }
  let accessToken: string;
  let apiBaseUrl: string;
  try {
    const { getUspsAccessTokenV2 } = await import(
      "../providers/usps/auth"
    );
    const r = await getUspsAccessTokenV2(ctx);
    accessToken = r.accessToken;
    apiBaseUrl = r.credentials.apiBaseUrl;
  } catch (err) {
    return {
      success: false,
      skippedReason: "usps_credentials_not_configured",
      errorMessage:
        err instanceof Error ? err.message.slice(0, 200) : String(err),
    };
  }
  const url = new URL(`${apiBaseUrl}/addresses/v3/address`);
  url.searchParams.set("streetAddress", address.line1 ?? "");
  if (address.line2) url.searchParams.set("secondaryAddress", address.line2);
  url.searchParams.set("city", address.city ?? "");
  if (address.state) url.searchParams.set("state", address.state);
  if (address.postalCode) {
    const zip5 = String(address.postalCode).slice(0, 5);
    url.searchParams.set("ZIPCode", zip5);
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    return {
      success: false,
      errorCode: String(res.status),
      errorMessage: body.slice(0, 500),
    };
  }
  const data = await readJson(res);
  if (!data.address) {
    return {
      success: false,
      errorMessage: "USPS response missing `address` object.",
      rawResponse: data,
    };
  }
  const zipCode = str(at(data, "address", "ZIPCode"));
  const zipPlus4 = str(at(data, "address", "ZIPPlus4"));
  const normalized: AddressInput = {
    line1: str(at(data, "address", "streetAddress")) ?? address.line1,
    line2: str(at(data, "address", "secondaryAddress")) ?? address.line2,
    city: str(at(data, "address", "city")) ?? address.city,
    state: str(at(data, "address", "state")) ?? address.state,
    postalCode: zipCode
      ? `${zipCode}${zipPlus4 ? `-${zipPlus4}` : ""}`
      : address.postalCode,
    countryCode: "US",
    firstName: address.firstName,
    lastName: address.lastName,
    company: address.company,
    phone: address.phone,
  };
  // USPS signals corrections via `corrections[]` + `matches[]` arrays.
  const corrections = list(data.corrections);
  const matches = list(data.matches);
  let status: UspsValidateResult["status"] = "valid";
  const warnings: string[] = [];
  if (matches.length > 1) {
    status = "ambiguous";
    warnings.push(`USPS returned ${matches.length} possible matches.`);
  } else if (corrections.length > 0) {
    status = "corrected";
    for (const c of corrections) {
      const text = str(at(c, "text"));
      if (text) warnings.push(`Corrected: ${text}`);
    }
  }
  // DeliveryPoint + residential heuristic.
  const deliveryPoint =
    str(at(data, "additionalInfo", "deliveryPoint")) ?? str(at(data, "address", "deliveryPoint"));
  const business = at(data, "additionalInfo", "business");
  const isResidential =
    typeof business === "string"
      ? business.toUpperCase() !== "Y"
      : undefined;
  return {
    success: true,
    status,
    normalizedAddress: normalized,
    isResidential,
    deliveryPoint,
    warnings: warnings.length > 0 ? warnings : undefined,
    rawResponse: data,
  };
}

/**
 * Internal variant — callable by the rate pipeline action.
 */
export const validateAddressInternal = internalAction({
  args: validateAddressArgs,
  returns: v.object({
    fromCache: v.boolean(),
    fingerprint: v.string(),
    provider: v.union(v.literal("google"), v.literal("ups"), v.literal("usps"), v.literal("fedex"), v.literal("smartystreets"), v.literal("skip")),
    status: v.union(v.literal("skipped"), v.literal("valid"), v.literal("corrected"), v.literal("invalid"), v.literal("unconfirmed"), v.literal("ambiguous"), v.literal("unsupported_country")),
    normalizedAddress: v.optional(v.object({
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      phone: v.optional(v.string()),
      company: v.optional(v.string()),
      line2: v.optional(v.string()),
      state: v.optional(v.string()),
      line1: v.string(),
      city: v.string(),
      postalCode: v.string(),
      countryCode: v.string(),
    })),
    isResidential: v.optional(v.boolean()),
    deliveryPoint: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
  }),
  handler: async (ctx, args): Promise<AddressValidationResult> => runValidateAddress(ctx, args),
});

/**
 * PRD A5 Address Validation — main entry point.
 *
 * Flow:
 *   1. Compute fingerprint.
 *   2. Check cache (30d for valid/corrected, 24h for invalid).
 *   3. On miss, walk provider priority (USPS → SmartyStreets → Google → skip).
 *   4. First provider that returns a definitive result wins.
 *   5. Cache result and return.
 *
 * The actual external calls are placeholders for now — each provider's
 * concrete implementation lands in its respective C1-C5 PRD
 * (USPS addresses is part of C3; SmartyStreets/Google are external
 * providers wired when credentials are configured).
 */
export const validateAddress = action({
  args: validateAddressArgs,
  returns: v.object({
    fromCache: v.boolean(),
    fingerprint: v.string(),
    provider: v.union(v.literal("google"), v.literal("ups"), v.literal("usps"), v.literal("fedex"), v.literal("smartystreets"), v.literal("skip")),
    status: v.union(v.literal("skipped"), v.literal("valid"), v.literal("corrected"), v.literal("invalid"), v.literal("unconfirmed"), v.literal("ambiguous"), v.literal("unsupported_country")),
    normalizedAddress: v.optional(v.object({
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      phone: v.optional(v.string()),
      company: v.optional(v.string()),
      line2: v.optional(v.string()),
      state: v.optional(v.string()),
      line1: v.string(),
      city: v.string(),
      postalCode: v.string(),
      countryCode: v.string(),
    })),
    isResidential: v.optional(v.boolean()),
    deliveryPoint: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
  }),
  handler: async (ctx, args): Promise<AddressValidationResult> => runValidateAddress(ctx, args),
});
