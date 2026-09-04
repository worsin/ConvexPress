/**
 * Auth capabilities — what Clerk is configured to accept for this site.
 *
 * Mirrors `AuthCapabilities` produced by the admin backend
 * (`auth/clerkConnectionHelpers.ts`, normalised from Clerk's public
 * `/v1/environment` document). The storefront never guesses: sign-up fields,
 * verification strategy, social providers, captcha, legal consent, password
 * rules and second factors all come from here.
 */

export type VerificationStrategy = "email_code" | "email_link" | "phone_code";

export interface AttributeCapability {
  enabled: boolean;
  required: boolean;
  verifications: VerificationStrategy[];
  usedForFirstFactor: boolean;
  usedForSecondFactor: boolean;
}

export interface PasswordPolicy {
  enabled: boolean;
  required: boolean;
  minLength: number;
  maxLength: number;
  requireSpecialChar: boolean;
  requireNumbers: boolean;
  requireUppercase: boolean;
  requireLowercase: boolean;
  allowedSpecialCharacters: string;
  showZxcvbn: boolean;
  minZxcvbnStrength: number;
}

export interface AuthCapabilities {
  version: 1;
  applicationName: string | null;
  environmentType: "development" | "production" | null;
  attributes: {
    emailAddress: AttributeCapability;
    phoneNumber: AttributeCapability;
    username: AttributeCapability;
    firstName: AttributeCapability;
    lastName: AttributeCapability;
    password: AttributeCapability;
  };
  social: string[];
  signUp: {
    mode: "public" | "restricted" | "waitlist";
    captchaEnabled: boolean;
    captchaWidgetType: "smart" | "invisible" | null;
    legalConsentEnabled: boolean;
    progressive: boolean;
  };
  signIn: {
    preferredStrategy: "password" | "otp";
    secondFactorRequired: boolean;
    firstFactors: string[];
    secondFactors: string[];
  };
  password: PasswordPolicy;
  passkeys: { enabled: boolean };
  links: {
    termsUrl: string | null;
    privacyPolicyUrl: string | null;
    supportEmail: string | null;
  };
}

export interface WebsiteAuthConfig {
  provider: "clerk" | "none";
  publishableKey: string | null;
  frontendApi: string | null;
  environmentType: "development" | "production" | null;
  deploymentTrustsIssuer: boolean;
  capabilities: AuthCapabilities;
  capabilitiesSyncedAt: number | null;
  connectionMode: "" | "manual" | "secret_key" | "keyless";
}

const ON: AttributeCapability = {
  enabled: true,
  required: true,
  verifications: ["email_code"],
  usedForFirstFactor: true,
  usedForSecondFactor: false,
};
const OFF: AttributeCapability = {
  enabled: false,
  required: false,
  verifications: [],
  usedForFirstFactor: false,
  usedForSecondFactor: false,
};

/** What the storefront assumed before capabilities existed: email + password, optional names. */
export function defaultAuthCapabilities(): AuthCapabilities {
  return {
    version: 1,
    applicationName: null,
    environmentType: null,
    // Fresh objects every call: callers (and tests) may mutate the result.
    attributes: {
      emailAddress: { ...ON, verifications: [...ON.verifications] },
      phoneNumber: { ...OFF, verifications: [] },
      username: { ...OFF, verifications: [] },
      firstName: { ...OFF, enabled: true, verifications: [] },
      lastName: { ...OFF, enabled: true, verifications: [] },
      password: { ...ON, verifications: [], usedForFirstFactor: false },
    },
    social: [],
    signUp: { mode: "public", captchaEnabled: false, captchaWidgetType: null, legalConsentEnabled: false, progressive: true },
    signIn: { preferredStrategy: "password", secondFactorRequired: false, firstFactors: ["password", "email_code"], secondFactors: [] },
    password: {
      enabled: true,
      required: true,
      minLength: 8,
      maxLength: 72,
      requireSpecialChar: false,
      requireNumbers: false,
      requireUppercase: false,
      requireLowercase: false,
      allowedSpecialCharacters: "",
      showZxcvbn: false,
      minZxcvbnStrength: 0,
    },
    passkeys: { enabled: false },
    links: { termsUrl: null, privacyPolicyUrl: null, supportEmail: null },
  };
}

export function defaultWebsiteAuthConfig(): WebsiteAuthConfig {
  return {
    provider: "none",
    publishableKey: null,
    frontendApi: null,
    environmentType: null,
    deploymentTrustsIssuer: false,
    capabilities: defaultAuthCapabilities(),
    capabilitiesSyncedAt: null,
    connectionMode: "",
  };
}

export function coerceAuthConfig(value: unknown): WebsiteAuthConfig {
  const fallback = defaultWebsiteAuthConfig();
  if (!value || typeof value !== "object") return fallback;
  const record = value as Partial<WebsiteAuthConfig>;
  const capabilities =
    record.capabilities && typeof record.capabilities === "object" && (record.capabilities as AuthCapabilities).version === 1
      ? (record.capabilities as AuthCapabilities)
      : fallback.capabilities;
  return {
    provider: record.provider === "clerk" ? "clerk" : "none",
    publishableKey: typeof record.publishableKey === "string" ? record.publishableKey : null,
    frontendApi: typeof record.frontendApi === "string" ? record.frontendApi : null,
    environmentType: record.environmentType === "production" || record.environmentType === "development" ? record.environmentType : null,
    deploymentTrustsIssuer: record.deploymentTrustsIssuer === true,
    capabilities,
    capabilitiesSyncedAt: typeof record.capabilitiesSyncedAt === "number" ? record.capabilitiesSyncedAt : null,
    connectionMode:
      record.connectionMode === "manual" || record.connectionMode === "secret_key" || record.connectionMode === "keyless"
        ? record.connectionMode
        : "",
  };
}

// ─── Derived views used by the forms ────────────────────────────────────────

export type SignUpFieldName = "emailAddress" | "phoneNumber" | "username" | "firstName" | "lastName" | "password";

export interface SignUpField {
  name: SignUpFieldName;
  required: boolean;
}

/** Fields the registration form renders, in display order, per Clerk's settings. */
export function signUpFields(capabilities: AuthCapabilities): SignUpField[] {
  const a = capabilities.attributes;
  const fields: SignUpField[] = [];
  if (a.firstName.enabled) fields.push({ name: "firstName", required: a.firstName.required });
  if (a.lastName.enabled) fields.push({ name: "lastName", required: a.lastName.required });
  if (a.emailAddress.enabled) fields.push({ name: "emailAddress", required: a.emailAddress.required });
  if (a.phoneNumber.enabled) fields.push({ name: "phoneNumber", required: a.phoneNumber.required });
  if (a.username.enabled) fields.push({ name: "username", required: a.username.required });
  if (a.password.enabled) fields.push({ name: "password", required: a.password.required });
  return fields;
}

/** Clerk's `missingFields` / `unverifiedFields` spelling → our field names. */
export const CLERK_FIELD_NAMES: Record<string, SignUpFieldName> = {
  email_address: "emailAddress",
  phone_number: "phoneNumber",
  username: "username",
  first_name: "firstName",
  last_name: "lastName",
  password: "password",
};

export function preferredEmailVerification(capabilities: AuthCapabilities): "email_code" | "email_link" {
  const strategies = capabilities.attributes.emailAddress.verifications;
  if (strategies.includes("email_code")) return "email_code";
  if (strategies.includes("email_link")) return "email_link";
  return "email_code";
}

/** Which identifier the sign-in form asks for first. */
export function signInIdentifierKinds(capabilities: AuthCapabilities): Array<"email" | "username" | "phone"> {
  const kinds: Array<"email" | "username" | "phone"> = [];
  if (capabilities.attributes.emailAddress.enabled && capabilities.attributes.emailAddress.usedForFirstFactor) kinds.push("email");
  if (capabilities.attributes.username.enabled && capabilities.attributes.username.usedForFirstFactor) kinds.push("username");
  if (capabilities.attributes.phoneNumber.enabled && capabilities.attributes.phoneNumber.usedForFirstFactor) kinds.push("phone");
  return kinds.length ? kinds : ["email"];
}

export function identifierLabel(kinds: Array<"email" | "username" | "phone">): string {
  const names = kinds.map((kind) => (kind === "email" ? "Email" : kind === "username" ? "Username" : "Phone"));
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** Password rule violations for the client-side pre-check (Clerk still has the final say). */
export function passwordPolicyErrors(password: string, policy: PasswordPolicy): string[] {
  const errors: string[] = [];
  if (!password) return ["Enter a password."];
  const min = policy.minLength > 0 ? policy.minLength : 8;
  if (password.length < min) errors.push(`Use at least ${min} characters.`);
  if (policy.maxLength > 0 && password.length > policy.maxLength) errors.push(`Use at most ${policy.maxLength} characters.`);
  if (policy.requireNumbers && !/\d/.test(password)) errors.push("Include a number.");
  if (policy.requireUppercase && !/[A-Z]/.test(password)) errors.push("Include an uppercase letter.");
  if (policy.requireLowercase && !/[a-z]/.test(password)) errors.push("Include a lowercase letter.");
  if (policy.requireSpecialChar) {
    const allowed = policy.allowedSpecialCharacters || "!\"#$%&'()*+,-./:;<=>?@[]^_`{|}~";
    const hasSpecial = Array.from(password).some((char) => allowed.includes(char));
    if (!hasSpecial) errors.push("Include a special character.");
  }
  return errors;
}

export interface SocialProviderView {
  strategy: string;
  label: string;
  key: string;
}

const SOCIAL_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  apple: "Apple",
  microsoft: "Microsoft",
  facebook: "Facebook",
  discord: "Discord",
  linkedin: "LinkedIn",
  linkedin_oidc: "LinkedIn",
  x: "X",
  twitter: "X",
  gitlab: "GitLab",
  slack: "Slack",
  twitch: "Twitch",
  spotify: "Spotify",
  notion: "Notion",
  dropbox: "Dropbox",
  atlassian: "Atlassian",
  bitbucket: "Bitbucket",
  box: "Box",
  coinbase: "Coinbase",
  hubspot: "HubSpot",
  line: "LINE",
  linear: "Linear",
  tiktok: "TikTok",
  xero: "Xero",
};

export function socialProviders(capabilities: AuthCapabilities): SocialProviderView[] {
  return capabilities.social
    .filter((strategy) => strategy.startsWith("oauth_"))
    .map((strategy) => {
      const key = strategy.replace(/^oauth_/, "");
      const label = SOCIAL_LABELS[key] ?? key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return { strategy, label, key };
    });
}
