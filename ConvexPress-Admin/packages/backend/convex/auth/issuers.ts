/**
 * Trusted JWT issuers, shared by `auth.config.ts` (which registers them with
 * Convex) and `helpers/permissions.ts` (which maps a verified identity to a
 * ConvexPress user). Keeping one definition stops the two from drifting.
 *
 * Every verified identity belongs to exactly one issuer kind, and an identity
 * may only resolve through the user records its issuer owns:
 *
 *   admin       ConvexPress local admin JWT. Subject is the users `_id`.
 *   management  Control-plane management session. Subject is the session id.
 *   clerk       The configured Clerk instance. Subject is `users.clerkUserId`.
 *   external    Any other issuer an integrator trusts in `auth.config.ts`.
 *               Resolves only through a server-side `userExternalIdentities`
 *               link, never by subject alone.
 *
 * Pure module: no Convex runtime imports, so `auth.config.ts` can bundle it.
 */

export const ADMIN_ISSUER = "https://convexpress-admin.local";
export const MANAGEMENT_ISSUER = "https://convexpress-management.local";

export type IdentityIssuerKind = "admin" | "management" | "clerk" | "external";

/** The identity fields issuer classification reads. */
export type IssuedIdentity = { tokenIdentifier: string; issuer?: string };

/**
 * Read an optional deployment variable. Convex evaluates `auth.config.ts` with
 * a `process.env` that is not enumerable and throws on a missing variable, so
 * read directly and treat a throw as "not set". Function runtimes return
 * `undefined` for a missing variable, which is handled the same way.
 */
export function readOptionalEnv(name: string): string | undefined {
  try {
    const value = process.env[name];
    return value && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** The raw `CLERK_JWT_ISSUER_DOMAIN` value `auth.config.ts` registers. */
export function clerkIssuerDomain(): string | undefined {
  return readOptionalEnv("CLERK_JWT_ISSUER_DOMAIN");
}

/** Issuer comparison ignores surrounding whitespace and trailing slashes. */
export function normalizeIssuer(issuer: string): string {
  return issuer.trim().replace(/\/+$/, "");
}

/** The normalized Clerk issuer, or null when Clerk is not configured. */
export function configuredClerkIssuer(): string | null {
  const domain = clerkIssuerDomain();
  return domain ? normalizeIssuer(domain) : null;
}

/** True only for the Clerk instance this deployment trusts. */
export function isConfiguredClerkIssuer(issuer: string | undefined): boolean {
  const clerk = configuredClerkIssuer();
  return clerk !== null && typeof issuer === "string" && normalizeIssuer(issuer) === clerk;
}

/** ConvexPress's own issuers and the configured Clerk issuer can never back an external link. */
export function isReservedIssuer(issuer: string): boolean {
  const normalized = normalizeIssuer(issuer);
  return (
    normalized === ADMIN_ISSUER ||
    normalized === MANAGEMENT_ISSUER ||
    isConfiguredClerkIssuer(normalized)
  );
}

/**
 * Classify a verified identity. ConvexPress's own issuers are recognized by
 * the issuer prefix of `tokenIdentifier`. Clerk requires the token's issuer
 * to equal the configured Clerk issuer; anything else is external.
 */
export function classifyIdentity(identity: IssuedIdentity): IdentityIssuerKind {
  if (identity.tokenIdentifier.startsWith(`${ADMIN_ISSUER}|`)) return "admin";
  if (identity.tokenIdentifier.startsWith(`${MANAGEMENT_ISSUER}|`)) return "management";
  if (isConfiguredClerkIssuer(identity.issuer)) return "clerk";
  return "external";
}

/**
 * Convex's `UserIdentity.tokenIdentifier` for an issuer and subject: the
 * token's `iss` claim and `sub` claim joined by `|` (the backend, the CLI's
 * `--identity` and convex-test all build it this way). Pass the issuer exactly
 * as it appears in the token's `iss` claim.
 */
export function tokenIdentifierFor(issuer: string, subject: string): string {
  return `${issuer}|${subject}`;
}
