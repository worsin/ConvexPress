export const FIRST_ADMIN_SETUP_ROUTE = "/setup";

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
