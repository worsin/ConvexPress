/**
 * Two-step verification on the website account (Security page), on Clerk's
 * user APIs: which second factors the site's Clerk accepts, and the small
 * pieces the setup and its management need.
 */
import type { AuthCapabilities } from "./capabilities";

/** The second factors the site's Clerk instance accepts. */
export interface SecondFactorOptions {
  authenticatorApp: boolean;
  backupCodes: boolean;
  textMessage: boolean;
}

/**
 * From the capabilities ConvexPress last read from Clerk (auth_config.second_factors:
 * "totp", "phone_code", "backup_code"). Before they were ever read, every
 * option is offered and Clerk itself refuses what's off.
 */
export function secondFactorOptions(capabilities: AuthCapabilities, syncedAt: number | null): SecondFactorOptions {
  if (syncedAt === null) return { authenticatorApp: true, backupCodes: true, textMessage: true };
  const factors = new Set(capabilities.signIn.secondFactors);
  return {
    authenticatorApp: factors.has("totp"),
    backupCodes: factors.has("backup_code"),
    textMessage: factors.has("phone_code"),
  };
}

/** The digits of a typed or pasted code, at most six. */
export function normalizeTotpCode(input: string): string {
  return input.replace(/\D/g, "").slice(0, 6);
}

/** A setup key in groups of four, easier to type into an authenticator. */
export function groupSetupKey(secret: string): string {
  return secret.replace(/\s+/g, "").toUpperCase().match(/.{1,4}/g)?.join(" ") ?? "";
}

/** The backup codes as a file to keep: whose they are, when they were issued, one code per line. */
export function backupCodesFile(siteName: string, codes: readonly string[], issuedAt: Date): string {
  return [
    `${siteName} — backup codes`,
    `Issued ${issuedAt.toISOString().slice(0, 10)}. Each code signs you in once if you can't get a code any other way.`,
    "Keep them somewhere safe and private.",
    "",
    ...codes,
    "",
  ].join("\n");
}

/** A file name for the backup codes: the site's name as a slug. */
export function backupCodesFileName(siteName: string): string {
  const slug = siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "account"}-backup-codes.txt`;
}

function clerkErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("errors" in error)) return null;
  const errors: unknown = Reflect.get(error, "errors");
  if (!Array.isArray(errors)) return null;
  const first: unknown = errors[0];
  if (!first || typeof first !== "object") return null;
  const code: unknown = Reflect.get(first, "code");
  return typeof code === "string" ? code : null;
}

/** What to tell the account holder when Clerk refuses a step. */
export function twoFactorErrorMessage(error: unknown): string {
  const code = clerkErrorCode(error);
  if (code === "form_code_incorrect" || code === "form_param_format_invalid") {
    return "That code didn't match. Codes change every 30 seconds, so enter the newest one.";
  }
  if (code === "too_many_requests") return "Too many tries. Wait a minute, then try again.";
  if (code === "totp_already_enabled" || code === "form_identifier_exists") {
    return "Two-step verification is already on. Reload the page to see it.";
  }
  if (code === "session_reverification_required" || code === "reverification_cancelled") {
    return "For your security, sign in again before changing two-step verification.";
  }
  return "Something went wrong. Try again in a moment.";
}

/** A typed phone number as Clerk wants it (E.164); a 10-digit number is taken as US. Null when it can't be one. */
export function normalizePhoneNumber(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** A phone number with all but its last four digits hidden. */
export function maskPhoneNumber(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : phoneNumber;
}

/** A signed-in device, as the Security page lists it. */
export interface DeviceSession {
  id: string;
  current: boolean;
  /** "Chrome on macOS", "Safari on iPhone"… */
  device: string;
  /** "Provo, US", or null when Clerk doesn't know. */
  place: string | null;
  /** A phone or tablet. */
  mobile: boolean;
  lastActiveAt: number;
}

/** Clerk's latest activity on a session, as a short description of the device. */
export function describeDevice(activity: { browserName?: string; deviceType?: string; isMobile?: boolean } | null | undefined): string {
  const browser = activity?.browserName?.trim();
  const device = activity?.deviceType?.trim();
  if (browser && device) return `${browser} on ${device}`;
  if (browser) return activity?.isMobile ? `${browser} on a phone` : browser;
  if (device) return device;
  return activity?.isMobile ? "A phone" : "A browser";
}

/** "City, Country" from Clerk's latest activity, or null. */
export function describePlace(activity: { city?: string; country?: string } | null | undefined): string | null {
  const parts = [activity?.city?.trim(), activity?.country?.trim()].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : null;
}

/** This device first, then the most recently active. */
export function orderSessions(sessions: readonly DeviceSession[]): DeviceSession[] {
  return [...sessions].sort((a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt - a.lastActiveAt);
}

/** "Active now", "Active 5 minutes ago", "Active 3 hours ago", or the date. */
export function lastActiveLabel(lastActiveAt: number, now: number): string {
  const minutes = Math.floor((now - lastActiveAt) / 60_000);
  if (minutes < 2) return "Active now";
  if (minutes < 60) return `Active ${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Active ${days} ${days === 1 ? "day" : "days"} ago`;
  return `Last active ${new Date(lastActiveAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}
