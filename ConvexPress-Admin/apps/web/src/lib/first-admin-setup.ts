export const FIRST_ADMIN_SETUP_ROUTE = "/setup";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,64}$/;

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

export type FirstAdminFormValidation =
  | { ok: true; credentials: FirstAdminCredentials }
  | { ok: false; error: string };

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
