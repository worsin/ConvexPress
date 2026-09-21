/** Deployment configuration is not imported with database snapshots. */
export function credentialEnvironmentBinding(): string | null {
  const raw = process.env.AUTH_ISSUER_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!new Set(["https:", "http:"]).has(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/, "")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function requireCredentialEnvironmentBinding(): string {
  const binding = credentialEnvironmentBinding();
  if (!binding) throw new Error("Credential environment is not configured");
  return binding;
}

export function credentialBelongsToEnvironment(binding: string | undefined): boolean {
  const expected = credentialEnvironmentBinding();
  // Old unstamped credentials cannot safely be adopted after an unknown snapshot copy.
  return expected !== null && binding === expected;
}
