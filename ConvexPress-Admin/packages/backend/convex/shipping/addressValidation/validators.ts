import { v } from "convex/values";

export const addressInputValidator = v.object({
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
});

export const providerLiteralValidator = v.union(
  v.literal("usps"),
  v.literal("smartystreets"),
  v.literal("google"),
  v.literal("ups"),
  v.literal("fedex"),
  v.literal("skip"),
);

export const validateAddressArgs = {
  address: addressInputValidator,
  // If true, skip the cache and re-validate.
  force: v.optional(v.boolean()),
};

export const recordValidationArgs = {
  fingerprint: v.string(),
  provider: providerLiteralValidator,
  status: v.union(
    v.literal("valid"),
    v.literal("corrected"),
    v.literal("invalid"),
    v.literal("unconfirmed"),
    v.literal("ambiguous"),
    v.literal("unsupported_country"),
    v.literal("skipped"),
  ),
  inputAddress: v.any(),
  normalizedAddress: v.optional(v.any()),
  isResidential: v.optional(v.boolean()),
  deliveryPoint: v.optional(v.string()),
  warnings: v.optional(v.array(v.string())),
  geocode: v.optional(
    v.object({ lat: v.number(), lng: v.number(), accuracy: v.string() }),
  ),
  rawResponse: v.optional(v.any()),
  validationDiagnostics: v.optional(v.any()),
  ttlMs: v.optional(v.number()),
};

export const getValidationArgs = { fingerprint: v.string() };
