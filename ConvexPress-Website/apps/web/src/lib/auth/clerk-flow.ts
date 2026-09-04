/**
 * Clerk flow reducers — pure decisions over Clerk's SignIn / SignUp resources.
 *
 * Clerk reports what is still missing (`status`, `missingFields`,
 * `unverifiedFields`, `supportedFirstFactors`, `supportedSecondFactors`). These
 * helpers turn that into the next screen to show, so the forms never guess what
 * a status means and every Clerk configuration resolves to a concrete step.
 */

import { CLERK_FIELD_NAMES, type AuthCapabilities, type SignUpFieldName } from "./capabilities";

// ─── Sign-up ────────────────────────────────────────────────────────────────

export interface SignUpSnapshot {
  status: string | null | undefined;
  createdSessionId?: string | null;
  missingFields?: string[] | null;
  unverifiedFields?: string[] | null;
  verifications?: {
    emailAddress?: { status?: string | null; strategy?: string | null } | null;
    phoneNumber?: { status?: string | null; strategy?: string | null } | null;
  } | null;
}

export type SignUpNext =
  | { kind: "complete"; sessionId: string }
  | { kind: "verify_email"; strategy: "email_code" | "email_link" }
  | { kind: "verify_phone" }
  | { kind: "collect"; fields: SignUpFieldName[]; unknown: string[] }
  | { kind: "legal_consent" }
  | { kind: "captcha" }
  | { kind: "restricted" }
  | { kind: "abandoned" }
  | { kind: "unknown"; status: string };

export function nextSignUpStep(signUp: SignUpSnapshot, capabilities: AuthCapabilities): SignUpNext {
  const status = signUp.status ?? "";
  if (status === "complete" && signUp.createdSessionId) {
    return { kind: "complete", sessionId: signUp.createdSessionId };
  }
  if (status === "abandoned") return { kind: "abandoned" };

  const missing = (signUp.missingFields ?? []).filter(Boolean);
  const unverified = (signUp.unverifiedFields ?? []).filter(Boolean);

  // Consent and captcha come back as missing pseudo-fields.
  if (missing.includes("legal_accepted")) return { kind: "legal_consent" };
  if (missing.includes("captcha_token")) return { kind: "captcha" };

  const known: SignUpFieldName[] = [];
  const unknown: string[] = [];
  for (const field of missing) {
    const mapped = CLERK_FIELD_NAMES[field];
    if (mapped) known.push(mapped);
    else unknown.push(field);
  }
  if (known.length > 0 || unknown.length > 0) return { kind: "collect", fields: known, unknown };

  if (unverified.includes("email_address")) {
    const strategies = capabilities.attributes.emailAddress.verifications;
    const strategy = strategies.includes("email_code")
      ? "email_code"
      : strategies.includes("email_link")
        ? "email_link"
        : "email_code";
    return { kind: "verify_email", strategy };
  }
  if (unverified.includes("phone_number")) return { kind: "verify_phone" };

  if (status === "missing_requirements") {
    // Nothing named: Clerk's restricted / waitlist modes end here.
    return capabilities.signUp.mode !== "public" ? { kind: "restricted" } : { kind: "unknown", status };
  }
  return { kind: "unknown", status: status || "empty" };
}

// ─── Sign-in ────────────────────────────────────────────────────────────────

export interface FactorLike {
  strategy: string;
  emailAddressId?: string;
  phoneNumberId?: string;
  safeIdentifier?: string;
  primary?: boolean;
}

export interface SignInSnapshot {
  status: string | null | undefined;
  createdSessionId?: string | null;
  supportedFirstFactors?: FactorLike[] | null;
  supportedSecondFactors?: FactorLike[] | null;
}

export type SignInNext =
  | { kind: "complete"; sessionId: string }
  | { kind: "password" }
  | { kind: "first_code"; strategy: "email_code" | "phone_code" | "email_link"; factor: FactorLike }
  | { kind: "second_code"; strategy: "totp" | "phone_code" | "backup_code"; factor: FactorLike | null; alternatives: string[] }
  | { kind: "new_password" }
  | { kind: "needs_identifier" }
  | { kind: "unsupported"; strategies: string[] }
  | { kind: "unknown"; status: string };

const FIRST_FACTOR_ORDER = ["password", "email_code", "phone_code", "email_link"] as const;
const SECOND_FACTOR_ORDER = ["totp", "phone_code", "backup_code"] as const;

/**
 * Decide the next sign-in screen. `passwordEntered` says whether the current
 * screen already sent a password (so we do not loop on the password step).
 */
export function nextSignInStep(
  signIn: SignInSnapshot,
  options: { passwordEntered: boolean; preferOtp: boolean },
): SignInNext {
  const status = signIn.status ?? "";
  if (status === "complete" && signIn.createdSessionId) {
    return { kind: "complete", sessionId: signIn.createdSessionId };
  }
  if (status === "needs_identifier") return { kind: "needs_identifier" };
  if (status === "needs_new_password") return { kind: "new_password" };

  if (status === "needs_first_factor") {
    const factors = signIn.supportedFirstFactors ?? [];
    const available = new Set(factors.map((factor) => factor.strategy));
    const order = options.preferOtp || options.passwordEntered
      ? (["email_code", "phone_code", "email_link", "password"] as const)
      : FIRST_FACTOR_ORDER;
    for (const strategy of order) {
      if (!available.has(strategy)) continue;
      if (strategy === "password") {
        if (options.passwordEntered) continue;
        return { kind: "password" };
      }
      const factor = factors.find((item) => item.strategy === strategy)!;
      return { kind: "first_code", strategy, factor };
    }
    return { kind: "unsupported", strategies: Array.from(available) };
  }

  if (status === "needs_second_factor") {
    const factors = signIn.supportedSecondFactors ?? [];
    const available = factors.map((factor) => factor.strategy);
    for (const strategy of SECOND_FACTOR_ORDER) {
      const factor = factors.find((item) => item.strategy === strategy);
      if (factor) {
        return {
          kind: "second_code",
          strategy,
          factor,
          alternatives: available.filter((item) => item !== strategy && SECOND_FACTOR_ORDER.includes(item as never)),
        };
      }
    }
    return { kind: "unsupported", strategies: available };
  }

  return { kind: "unknown", status: status || "empty" };
}

/** Human copy for a code prompt. */
export function codePromptCopy(strategy: string, identifier?: string): { title: string; body: string } {
  switch (strategy) {
    case "email_code":
      return { title: "Check your email", body: identifier ? `We sent a code to ${identifier}.` : "We emailed you a sign-in code." };
    case "email_link":
      return { title: "Check your email", body: identifier ? `We sent a sign-in link to ${identifier}.` : "We emailed you a sign-in link." };
    case "phone_code":
      return { title: "Check your phone", body: identifier ? `We texted a code to ${identifier}.` : "We texted you a code." };
    case "totp":
      return { title: "Two-step verification", body: "Enter the code from your authenticator app." };
    case "backup_code":
      return { title: "Backup code", body: "Enter one of your backup codes." };
    default:
      return { title: "Verification", body: "Enter the code you received." };
  }
}

/** Shape a user-typed identifier for Clerk. */
export function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (/^\+?[\d\s().-]{7,}$/.test(trimmed) && !trimmed.includes("@")) {
    return trimmed.replace(/[\s().-]/g, "");
  }
  return trimmed;
}
