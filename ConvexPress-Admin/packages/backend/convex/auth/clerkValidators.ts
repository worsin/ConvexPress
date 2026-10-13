/**
 * Convex validators for the Clerk connection contracts typed in
 * `clerkConnectionHelpers.ts` and `settings/defaults.ts`.
 */
import { v, type Validator } from "convex/values";
import type { ClerkIntegrationSettings } from "../settings/defaults";
import type { AttributeCapability, AuthCapabilities, ClerkVerification } from "./clerkConnectionHelpers";

const attributeCapabilityValidator: Validator<AttributeCapability, "required", string> = v.object({
  enabled: v.boolean(),
  required: v.boolean(),
  verifications: v.array(v.union(v.literal("email_code"), v.literal("email_link"), v.literal("phone_code"))),
  usedForFirstFactor: v.boolean(),
  usedForSecondFactor: v.boolean(),
});

export const authCapabilitiesValidator: Validator<AuthCapabilities, "required", string> = v.object({
  version: v.literal(1),
  applicationName: v.union(v.null(), v.string()),
  environmentType: v.union(v.null(), v.literal("production"), v.literal("development")),
  attributes: v.object({
    emailAddress: attributeCapabilityValidator,
    phoneNumber: attributeCapabilityValidator,
    username: attributeCapabilityValidator,
    firstName: attributeCapabilityValidator,
    lastName: attributeCapabilityValidator,
    password: attributeCapabilityValidator,
  }),
  social: v.array(v.string()),
  signUp: v.object({
    mode: v.union(v.literal("public"), v.literal("restricted"), v.literal("waitlist")),
    captchaEnabled: v.boolean(),
    captchaWidgetType: v.union(v.null(), v.literal("smart"), v.literal("invisible")),
    legalConsentEnabled: v.boolean(),
    progressive: v.boolean(),
  }),
  signIn: v.object({
    preferredStrategy: v.union(v.literal("password"), v.literal("otp")),
    secondFactorRequired: v.boolean(),
    firstFactors: v.array(v.string()),
    secondFactors: v.array(v.string()),
  }),
  password: v.object({
    enabled: v.boolean(),
    required: v.boolean(),
    minLength: v.number(),
    maxLength: v.number(),
    requireSpecialChar: v.boolean(),
    requireNumbers: v.boolean(),
    requireUppercase: v.boolean(),
    requireLowercase: v.boolean(),
    allowedSpecialCharacters: v.string(),
    showZxcvbn: v.boolean(),
    minZxcvbnStrength: v.number(),
  }),
  passkeys: v.object({ enabled: v.boolean() }),
  links: v.object({
    termsUrl: v.union(v.null(), v.string()),
    privacyPolicyUrl: v.union(v.null(), v.string()),
    supportEmail: v.union(v.null(), v.string()),
  }),
});

export const clerkVerificationValidator: Validator<ClerkVerification, "required", string> = v.object({
  checkedAt: v.optional(v.number()),
  secretKeyValid: v.optional(v.boolean()),
  secretKeyError: v.optional(v.string()),
  jwtTemplatePresent: v.optional(v.boolean()),
  jwtTemplateAudienceOk: v.optional(v.boolean()),
  jwksKeyCount: v.optional(v.union(v.null(), v.number())),
  tokenProbeAt: v.optional(v.number()),
  tokenProbeOk: v.optional(v.boolean()),
});

const nullableNumber = v.union(v.null(), v.number());

/** Every `integrations.clerk` field, each optional: a partial update to the section. */
export const clerkIntegrationSettingsPatchValidator: Validator<Partial<ClerkIntegrationSettings>, "required", string> =
  v.object({
    clerkSecretKey: v.optional(v.string()),
    clerkWebhookSecret: v.optional(v.string()),
    clerkJwtIssuerDomain: v.optional(v.string()),
    clerkPublishableKey: v.optional(v.string()),
    clerkFrontendApi: v.optional(v.string()),
    clerkEnvironmentType: v.optional(v.union(v.literal(""), v.literal("development"), v.literal("production"))),
    clerkInstanceId: v.optional(v.string()),
    clerkConnectionMode: v.optional(
      v.union(v.literal(""), v.literal("manual"), v.literal("secret_key"), v.literal("keyless")),
    ),
    clerkClaimUrl: v.optional(v.string()),
    clerkDashboardUrl: v.optional(v.string()),
    clerkClaimedAt: v.optional(nullableNumber),
    clerkConnectedAt: v.optional(nullableNumber),
    clerkJwtTemplateId: v.optional(v.string()),
    clerkSvixConfigured: v.optional(v.boolean()),
    clerkSiteOrigins: v.optional(v.array(v.string())),
    clerkCapabilities: v.optional(v.union(v.null(), authCapabilitiesValidator)),
    clerkCapabilitiesSyncedAt: v.optional(nullableNumber),
    clerkLastVerification: v.optional(v.union(v.null(), clerkVerificationValidator)),
    clerkLastVerifiedAt: v.optional(nullableNumber),
    clerkWebhookLastReceivedAt: v.optional(nullableNumber),
  });
