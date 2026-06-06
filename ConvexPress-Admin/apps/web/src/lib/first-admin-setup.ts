export const FIRST_ADMIN_SETUP_ROUTE = "/setup";
export const SETUP_CREDENTIAL_HANDOFF_TTL_MS = 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,64}$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_DISPLAY_NAME_LENGTH = 128;
const MAX_PASSWORD_LENGTH = 256;
const MAX_SETUP_TOKEN_LENGTH = 256;
const MAX_IDENTIFIER_LENGTH = 254;

export type FirstAdminFormInput = {
  displayName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type FirstAdminCredentials = {
  displayName: string;
  username: string;
  email: string;
  password: string;
};

export type FirstAdminSetupCredentials = {
  displayName?: string;
  username: string;
  email: string;
  password: string;
  setupToken?: string;
};

export type PendingAdminCredentialHandoff = {
  displayName?: string;
  username?: string;
  email: string;
  password: string;
  setupToken?: string;
  createdAt?: number;
  expiresAt: number;
};

export type PendingLoginCredentialHandoff = {
  identifier: string;
  password: string;
  createdAt?: number;
  expiresAt: number;
};

export type FirstAdminFormValidation =
  | { ok: true; credentials: FirstAdminCredentials }
  | { ok: false; error: string };

export type CompleteFirstAdminSetupOptions = {
  credentials: FirstAdminSetupCredentials;
  createFirstAdmin: (
    credentials: FirstAdminSetupCredentials,
  ) => Promise<unknown>;
  login: (identifier: string, password: string) => Promise<unknown>;
  navigateToSetup: () => Promise<unknown> | unknown;
  allowExistingAdmin?: boolean;
};

export function deriveSetupUsername(
  email: string,
  explicitUsername?: string,
): string {
  if (explicitUsername?.trim()) return explicitUsername.trim();

  const prefix = email.split("@")[0] || "admin";
  const cleaned = prefix
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 64);

  if (cleaned.length >= 3) return cleaned;
  return "admin";
}

function hasFreshExpiry(value: { expiresAt?: unknown }, now: number): boolean {
  return (
    typeof value.expiresAt === "number" &&
    Number.isFinite(value.expiresAt) &&
    value.expiresAt > now
  );
}

function isOptionalBoundedString(value: unknown, maxLength: number): boolean {
  return value === undefined || (typeof value === "string" && value.length <= maxLength);
}

export function isPendingAdminCredentialHandoff(
  value: unknown,
  now = Date.now(),
): value is PendingAdminCredentialHandoff {
  if (!value || typeof value !== "object") return false;
  const handoff = value as Record<string, unknown>;
  const email =
    typeof handoff.email === "string"
      ? handoff.email.trim().toLowerCase()
      : "";
  return (
    typeof handoff.email === "string" &&
    email.length <= MAX_EMAIL_LENGTH &&
    EMAIL_RE.test(email) &&
    typeof handoff.password === "string" &&
    handoff.password.length >= 8 &&
    handoff.password.length <= MAX_PASSWORD_LENGTH &&
    isOptionalBoundedString(handoff.displayName, MAX_DISPLAY_NAME_LENGTH) &&
    (handoff.username === undefined ||
      (typeof handoff.username === "string" &&
        USERNAME_RE.test(handoff.username.trim()))) &&
    isOptionalBoundedString(handoff.setupToken, MAX_SETUP_TOKEN_LENGTH) &&
    hasFreshExpiry(handoff, now)
  );
}

export function isPendingLoginCredentialHandoff(
  value: unknown,
  now = Date.now(),
): value is PendingLoginCredentialHandoff {
  if (!value || typeof value !== "object") return false;
  const handoff = value as Record<string, unknown>;
  return (
    typeof handoff.identifier === "string" &&
    handoff.identifier.trim().length > 0 &&
    handoff.identifier.trim().length <= MAX_IDENTIFIER_LENGTH &&
    typeof handoff.password === "string" &&
    handoff.password.length > 0 &&
    handoff.password.length <= MAX_PASSWORD_LENGTH &&
    hasFreshExpiry(handoff, now)
  );
}

export function validateFirstAdminForm(
  input: FirstAdminFormInput,
): FirstAdminFormValidation {
  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  const username = deriveSetupUsername(email, input.username);
  const password = input.password;

  if (!displayName || !email || !password) {
    return { ok: false, error: "Please fill in all required fields." };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (email.length > MAX_EMAIL_LENGTH) {
    return { ok: false, error: "Email must be 254 characters or fewer." };
  }
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return {
      ok: false,
      error: "Display name must be 128 characters or fewer.",
    };
  }
  if (!USERNAME_RE.test(username)) {
    return {
      ok: false,
      error:
        "Username must be 3-64 characters and may contain letters, numbers, dots, underscores, or hyphens.",
    };
  }
  if (password !== input.confirmPassword) {
    return { ok: false, error: "Passwords don't match." };
  }
  if (password.length < 8) {
    return {
      ok: false,
      error: "Password must be at least 8 characters.",
    };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: "Password must be 256 characters or fewer.",
    };
  }

  return {
    ok: true,
    credentials: {
      displayName,
      username,
      email,
      password,
    },
  };
}

function isExistingAdminSetupError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  return message.toLowerCase().includes("administrator account already exists");
}

export async function completeFirstAdminSetup({
  credentials,
  createFirstAdmin,
  login,
  navigateToSetup,
  allowExistingAdmin = false,
}: CompleteFirstAdminSetupOptions) {
  try {
    await createFirstAdmin(credentials);
  } catch (error) {
    if (!allowExistingAdmin || !isExistingAdminSetupError(error)) {
      throw error;
    }
  }

  await login(credentials.email, credentials.password);
  await navigateToSetup();
}
