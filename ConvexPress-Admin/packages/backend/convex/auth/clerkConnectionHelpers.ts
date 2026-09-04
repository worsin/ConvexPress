/**
 * Clerk Connection — pure helpers.
 *
 * Everything the connection pipeline needs that does not touch the network or
 * the database: publishable-key ↔ Frontend API derivation, picking the primary
 * domain from Clerk's domain list, normalising Clerk's public environment
 * document into the `AuthCapabilities` contract the website renders from, and
 * computing the readiness ledger shown on the admin page.
 *
 * Pure TypeScript, no Convex imports: shared by actions, queries and tests.
 */

// ─── Publishable key ↔ Frontend API ─────────────────────────────────────────

export type ClerkEnvironmentType = "development" | "production";

export interface DecodedPublishableKey {
  environmentType: ClerkEnvironmentType;
  /** Host only, e.g. `verb-noun-00.clerk.accounts.dev`. */
  frontendApiHost: string;
  /** `https://<host>` — the value Convex expects as the JWT issuer domain. */
  frontendApi: string;
}

function toBase64(utf8: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(utf8, "utf8").toString("base64");
  return btoa(unescape(encodeURIComponent(utf8)));
}

function fromBase64(b64: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf8");
  return decodeURIComponent(escape(atob(b64)));
}

const PUBLISHABLE_KEY_RE = /^pk_(test|live)_([A-Za-z0-9+/=]+)$/;
const SECRET_KEY_RE = /^sk_(test|live)_[A-Za-z0-9]+$/;

export function isPublishableKey(value: unknown): value is string {
  return typeof value === "string" && PUBLISHABLE_KEY_RE.test(value.trim());
}

export function isSecretKey(value: unknown): value is string {
  return typeof value === "string" && SECRET_KEY_RE.test(value.trim());
}

/**
 * A Clerk publishable key is `pk_<env>_` + base64(`<frontend api host>$`).
 * Returns null when the key is not decodable.
 */
export function decodePublishableKey(publishableKey: string): DecodedPublishableKey | null {
  const match = PUBLISHABLE_KEY_RE.exec(publishableKey.trim());
  if (!match) return null;
  let decoded: string;
  try {
    decoded = fromBase64(match[2]);
  } catch {
    return null;
  }
  const host = decoded.replace(/\$$/, "").trim().toLowerCase();
  if (!host || /[\s/]/.test(host) || !host.includes(".")) return null;
  return {
    environmentType: match[1] === "live" ? "production" : "development",
    frontendApiHost: host,
    frontendApi: `https://${host}`,
  };
}

/** Inverse of `decodePublishableKey`. */
export function encodePublishableKey(
  frontendApiHost: string,
  environmentType: ClerkEnvironmentType,
): string {
  const host = frontendApiHost.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `pk_${environmentType === "production" ? "live" : "test"}_${toBase64(`${host}$`)}`;
}

/** Normalise any Frontend API spelling (host or URL) into `https://<host>`. */
export function normalizeFrontendApi(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return `https://${url.host.toLowerCase()}`;
  } catch {
    return "";
  }
}

export function environmentTypeFromSecretKey(secretKey: string): ClerkEnvironmentType | null {
  const match = SECRET_KEY_RE.exec(secretKey.trim());
  if (!match) return null;
  return match[1] === "live" ? "production" : "development";
}

// ─── Domains ─────────────────────────────────────────────────────────────────

export interface ClerkDomainRecord {
  id?: string;
  name?: string;
  is_satellite?: boolean;
  frontend_api_url?: string;
  development_origin?: string;
  accounts_portal_url?: string | null;
}

/**
 * Clerk lists the primary domain first, followed by satellites. Some legacy
 * development instances also list extra `localhost:<port>` domains that carry
 * their own Frontend API; when a publishable key is already known we prefer the
 * domain whose Frontend API matches it.
 */
export function pickPrimaryDomain(
  domains: ClerkDomainRecord[],
  knownFrontendApi?: string,
): ClerkDomainRecord | null {
  const candidates = domains.filter(
    (domain) => !domain.is_satellite && typeof domain.frontend_api_url === "string",
  );
  if (candidates.length === 0) return null;
  if (knownFrontendApi) {
    const wanted = normalizeFrontendApi(knownFrontendApi);
    const match = candidates.find(
      (domain) => normalizeFrontendApi(domain.frontend_api_url ?? "") === wanted,
    );
    if (match) return match;
  }
  const withPortal = candidates.find((domain) => domain.accounts_portal_url);
  return withPortal ?? candidates[0];
}

// ─── Allowed origins / redirect URLs ────────────────────────────────────────

export function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

/** Unique, normalised origins in first-seen order. */
export function uniqueOrigins(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const origin = normalizeOrigin(value);
    if (origin && !seen.has(origin)) {
      seen.add(origin);
      result.push(origin);
    }
  }
  return result;
}

/**
 * Clerk's `allowed_origins` is an allowlist: when it is empty every origin may
 * call the Frontend API, so adding to an empty list would *restrict* the
 * instance. Only extend a list that is already in use.
 */
export function mergeAllowedOrigins(
  existing: string[] | null | undefined,
  desired: string[],
): { changed: boolean; next: string[] | null } {
  if (!existing || existing.length === 0) return { changed: false, next: null };
  const next = uniqueOrigins([...existing, ...desired]);
  return { changed: next.length !== existing.length, next };
}

/** Redirect URLs the website's OAuth flow lands on, one per site origin. */
export function oauthRedirectUrls(siteOrigins: string[]): string[] {
  return uniqueOrigins(siteOrigins).map((origin) => `${origin}/api/auth/callback`);
}

// ─── Webhook endpoint ───────────────────────────────────────────────────────

/**
 * The webhook must reach the site's Convex HTTP-actions origin, never the admin
 * app. Cloud deployments use `.convex.site`; self-hosted use port + 1.
 */
export function webhookEndpointUrl(httpActionsOrigin: string | undefined | null): string | null {
  const origin = normalizeOrigin(httpActionsOrigin);
  return origin ? `${origin}/webhooks/clerk` : null;
}

export function deriveHttpActionsOrigin(deploymentOrigin: string | undefined | null): string | null {
  const origin = normalizeOrigin(deploymentOrigin);
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.hostname.endsWith(".convex.cloud")) {
      url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
      return url.origin;
    }
    if (url.port) {
      url.port = String(Number(url.port) + 1);
      return url.origin;
    }
  } catch {
    return null;
  }
  return null;
}

// ─── Auth capabilities (from Clerk's public environment document) ───────────

export type VerificationStrategy = "email_code" | "email_link" | "phone_code";

export interface AttributeCapability {
  enabled: boolean;
  required: boolean;
  /** Verification strategies Clerk accepts for this identifier during sign-up. */
  verifications: VerificationStrategy[];
  usedForFirstFactor: boolean;
  usedForSecondFactor: boolean;
}

export type SocialProvider = string; // "oauth_google", "oauth_github", …

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
  environmentType: ClerkEnvironmentType | null;
  attributes: {
    emailAddress: AttributeCapability;
    phoneNumber: AttributeCapability;
    username: AttributeCapability;
    firstName: AttributeCapability;
    lastName: AttributeCapability;
    password: AttributeCapability;
  };
  /** Enabled social providers in Clerk's strategy spelling, e.g. `oauth_google`. */
  social: SocialProvider[];
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

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function strategies(value: unknown): VerificationStrategy[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is VerificationStrategy =>
      item === "email_code" || item === "email_link" || item === "phone_code",
  );
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function attribute(raw: unknown): AttributeCapability {
  const record = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    enabled: bool(record.enabled),
    required: bool(record.required),
    verifications: strategies(record.verifications),
    usedForFirstFactor: bool(record.used_for_first_factor),
    usedForSecondFactor: bool(record.used_for_second_factor),
  };
}

/** Sensible defaults: what the storefront assumed before capabilities existed. */
export function defaultAuthCapabilities(): AuthCapabilities {
  const on: AttributeCapability = {
    enabled: true,
    required: true,
    verifications: ["email_code"],
    usedForFirstFactor: true,
    usedForSecondFactor: false,
  };
  const off: AttributeCapability = {
    enabled: false,
    required: false,
    verifications: [],
    usedForFirstFactor: false,
    usedForSecondFactor: false,
  };
  return {
    version: 1,
    applicationName: null,
    environmentType: null,
    attributes: {
      emailAddress: on,
      phoneNumber: off,
      username: off,
      firstName: { ...off, enabled: true },
      lastName: { ...off, enabled: true },
      password: { ...on, verifications: [], usedForFirstFactor: false },
    },
    social: [],
    signUp: {
      mode: "public",
      captchaEnabled: false,
      captchaWidgetType: null,
      legalConsentEnabled: false,
      progressive: true,
    },
    signIn: {
      preferredStrategy: "password",
      secondFactorRequired: false,
      firstFactors: ["password", "email_code"],
      secondFactors: [],
    },
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

/**
 * Normalise `GET {frontendApi}/v1/environment` into the website contract.
 * Tolerates missing sections: anything absent falls back to the defaults.
 */
export function normalizeClerkEnvironment(payload: unknown): AuthCapabilities {
  const defaults = defaultAuthCapabilities();
  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const userSettings = (root.user_settings ?? {}) as Record<string, unknown>;
  const display = (root.display_config ?? {}) as Record<string, unknown>;
  const authConfig = (root.auth_config ?? {}) as Record<string, unknown>;
  const attributes = (userSettings.attributes ?? {}) as Record<string, unknown>;
  const social = (userSettings.social ?? {}) as Record<string, Record<string, unknown>>;
  const signUp = (userSettings.sign_up ?? {}) as Record<string, unknown>;
  const signIn = (userSettings.sign_in ?? {}) as Record<string, Record<string, unknown>>;
  const passwordSettings = (userSettings.password_settings ?? {}) as Record<string, unknown>;
  const passkeySettings = (userSettings.passkey_settings ?? {}) as Record<string, unknown>;

  const hasAttributes = Object.keys(attributes).length > 0;
  const passwordAttribute = hasAttributes ? attribute(attributes.password) : defaults.attributes.password;

  const environmentType =
    display.instance_environment_type === "production"
      ? "production"
      : display.instance_environment_type === "development"
        ? "development"
        : null;

  const mode =
    signUp.mode === "restricted" || signUp.mode === "waitlist" || signUp.mode === "public"
      ? signUp.mode
      : defaults.signUp.mode;

  return {
    version: 1,
    applicationName: str(display.application_name),
    environmentType,
    attributes: hasAttributes
      ? {
          emailAddress: attribute(attributes.email_address),
          phoneNumber: attribute(attributes.phone_number),
          username: attribute(attributes.username),
          firstName: attribute(attributes.first_name),
          lastName: attribute(attributes.last_name),
          password: passwordAttribute,
        }
      : defaults.attributes,
    social: Object.entries(social)
      .filter(([key, value]) => key.startsWith("oauth_") && bool(value?.enabled))
      .map(([key]) => key)
      .sort(),
    signUp: {
      mode,
      captchaEnabled: bool(signUp.captcha_enabled),
      captchaWidgetType:
        signUp.captcha_widget_type === "invisible" || signUp.captcha_widget_type === "smart"
          ? signUp.captcha_widget_type
          : null,
      legalConsentEnabled: bool(signUp.legal_consent_enabled),
      progressive: bool(signUp.progressive, true),
    },
    signIn: {
      preferredStrategy: display.preferred_sign_in_strategy === "otp" ? "otp" : "password",
      secondFactorRequired: bool(signIn.second_factor?.required),
      firstFactors: stringList(authConfig.first_factors).length
        ? stringList(authConfig.first_factors)
        : defaults.signIn.firstFactors,
      secondFactors: stringList(authConfig.second_factors),
    },
    password: {
      enabled: passwordAttribute.enabled,
      required: passwordAttribute.required,
      minLength: Math.max(num(passwordSettings.min_length), 0) || defaults.password.minLength,
      maxLength: num(passwordSettings.max_length) || defaults.password.maxLength,
      requireSpecialChar: bool(passwordSettings.require_special_char),
      requireNumbers: bool(passwordSettings.require_numbers),
      requireUppercase: bool(passwordSettings.require_uppercase),
      requireLowercase: bool(passwordSettings.require_lowercase),
      allowedSpecialCharacters: str(passwordSettings.allowed_special_characters) ?? "",
      showZxcvbn: bool(passwordSettings.show_zxcvbn),
      minZxcvbnStrength: num(passwordSettings.min_zxcvbn_strength),
    },
    passkeys: {
      enabled:
        (hasAttributes && bool((attributes.passkey as Record<string, unknown> | undefined)?.enabled)) ||
        (Object.keys(passkeySettings).length > 0 && bool(passkeySettings.show_sign_in_button) && hasAttributes
          ? bool((attributes.passkey as Record<string, unknown> | undefined)?.enabled)
          : false),
    },
    links: {
      termsUrl: str(display.terms_url),
      privacyPolicyUrl: str(display.privacy_policy_url),
      supportEmail: str(display.support_email),
    },
  };
}

// ─── Readiness ledger ───────────────────────────────────────────────────────

export type ReadinessState = "ok" | "warn" | "fail" | "pending";

export interface ReadinessItem {
  id:
    | "secret_key"
    | "publishable_key"
    | "issuer"
    | "jwt_template"
    | "deployment_env"
    | "webhook"
    | "capabilities"
    | "claim";
  label: string;
  state: ReadinessState;
  note: string;
}

export interface ReadinessInput {
  secretKeyValid: boolean | null;
  secretKeyError?: string | null;
  publishableKey: string | null;
  issuer: string | null;
  jwksKeyCount: number | null;
  jwtTemplatePresent: boolean | null;
  jwtTemplateAudienceOk: boolean | null;
  deploymentIssuer: string | null;
  deploymentHasSecret: boolean;
  webhookSecretStored: boolean;
  webhookLastReceivedAt: number | null;
  capabilitiesSyncedAt: number | null;
  connectionMode: string;
  claimedAt: number | null;
}

export interface Readiness {
  items: ReadinessItem[];
  /** Customers can sign in and reach their account. */
  loginReady: boolean;
  /** Everything, including sync and webhook, is healthy. */
  complete: boolean;
}

export function computeReadiness(input: ReadinessInput): Readiness {
  const items: ReadinessItem[] = [];

  items.push(
    input.secretKeyValid === null
      ? { id: "secret_key", label: "Secret key", state: "pending", note: "Not checked yet." }
      : input.secretKeyValid
        ? { id: "secret_key", label: "Secret key", state: "ok", note: "Clerk accepted the key." }
        : {
            id: "secret_key",
            label: "Secret key",
            state: "fail",
            note: input.secretKeyError || "Clerk rejected the key.",
          },
  );

  items.push(
    input.publishableKey
      ? { id: "publishable_key", label: "Publishable key", state: "ok", note: "Served to the website." }
      : {
          id: "publishable_key",
          label: "Publishable key",
          state: "fail",
          note: "Missing. Connect again to derive it from the secret key.",
        },
  );

  items.push(
    !input.issuer
      ? { id: "issuer", label: "JWT issuer", state: "fail", note: "No Frontend API URL recorded." }
      : input.jwksKeyCount === null
        ? { id: "issuer", label: "JWT issuer", state: "pending", note: input.issuer }
        : input.jwksKeyCount > 0
          ? {
              id: "issuer",
              label: "JWT issuer",
              state: "ok",
              note: `${input.issuer} publishes ${input.jwksKeyCount} signing key${input.jwksKeyCount === 1 ? "" : "s"}.`,
            }
          : { id: "issuer", label: "JWT issuer", state: "fail", note: `${input.issuer} returned no signing keys.` },
  );

  items.push(
    input.jwtTemplatePresent === null
      ? { id: "jwt_template", label: "Convex token template", state: "pending", note: "Not checked yet." }
      : input.jwtTemplatePresent && input.jwtTemplateAudienceOk
        ? {
            id: "jwt_template",
            label: "Convex token template",
            state: "ok",
            note: 'Template "convex" issues tokens with aud=convex.',
          }
        : input.jwtTemplatePresent
          ? {
              id: "jwt_template",
              label: "Convex token template",
              state: "fail",
              note: 'Template "convex" exists but does not carry aud=convex.',
            }
          : {
              id: "jwt_template",
              label: "Convex token template",
              state: "fail",
              note: 'Template "convex" is missing. Connect again to create it.',
            },
  );

  const issuerMatches =
    !!input.issuer &&
    !!input.deploymentIssuer &&
    normalizeFrontendApi(input.deploymentIssuer) === normalizeFrontendApi(input.issuer);
  items.push(
    issuerMatches && input.deploymentHasSecret
      ? {
          id: "deployment_env",
          label: "Deployment trusts this Clerk app",
          state: "ok",
          note: "CLERK_JWT_ISSUER_DOMAIN and CLERK_SECRET_KEY are live on this deployment.",
        }
      : issuerMatches
        ? {
            id: "deployment_env",
            label: "Deployment trusts this Clerk app",
            state: "warn",
            note: "Issuer is live; CLERK_SECRET_KEY env var is absent (settings value will be used).",
          }
        : input.deploymentIssuer
          ? {
              id: "deployment_env",
              label: "Deployment trusts this Clerk app",
              state: "fail",
              note: `Deployment still trusts ${input.deploymentIssuer}. Apply the environment and redeploy.`,
            }
          : {
              id: "deployment_env",
              label: "Deployment trusts this Clerk app",
              state: "fail",
              note: "CLERK_JWT_ISSUER_DOMAIN is not set on this deployment. Apply the environment and redeploy.",
            },
  );

  items.push(
    input.webhookSecretStored && input.webhookLastReceivedAt
      ? {
          id: "webhook",
          label: "Profile sync webhook",
          state: "ok",
          note: `Last event received ${new Date(input.webhookLastReceivedAt).toISOString()}.`,
        }
      : input.webhookSecretStored
        ? {
            id: "webhook",
            label: "Profile sync webhook",
            state: "warn",
            note: "Signing secret saved; no event received yet.",
          }
        : {
            id: "webhook",
            label: "Profile sync webhook",
            state: "warn",
            note: "Not configured. Accounts are still created on first sign-in; profile edits made in Clerk will not sync.",
          },
  );

  items.push(
    input.capabilitiesSyncedAt
      ? {
          id: "capabilities",
          label: "Sign-in options synced",
          state: "ok",
          note: `Website forms follow Clerk's settings (synced ${new Date(input.capabilitiesSyncedAt).toISOString()}).`,
        }
      : {
          id: "capabilities",
          label: "Sign-in options synced",
          state: "warn",
          note: "Not synced yet; the website uses default assumptions.",
        },
  );

  if (input.connectionMode === "keyless") {
    items.push(
      input.claimedAt
        ? { id: "claim", label: "Clerk account", state: "ok", note: "Application claimed into your Clerk workspace." }
        : {
            id: "claim",
            label: "Clerk account",
            state: "warn",
            note: "Temporary keyless app. Claim it in Clerk before going live.",
          },
    );
  }

  const by = (id: ReadinessItem["id"]) => items.find((item) => item.id === id)?.state;
  const loginReady =
    by("secret_key") === "ok" &&
    by("publishable_key") === "ok" &&
    by("issuer") === "ok" &&
    by("jwt_template") === "ok" &&
    (by("deployment_env") === "ok" || by("deployment_env") === "warn");
  const complete = loginReady && items.every((item) => item.state === "ok");
  return { items, loginReady, complete };
}
