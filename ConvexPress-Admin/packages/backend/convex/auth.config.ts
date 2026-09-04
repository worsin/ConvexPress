import type { AuthConfig } from "convex/server";

const ADMIN_APPLICATION_ID = "convexpress-admin";
const ADMIN_ISSUER = "https://convexpress-admin.local";
const MANAGEMENT_ISSUER = "https://convexpress-management.local";

if (!process.env.AUTH_ISSUER_URL?.trim() || !/^https?:\/\//.test(process.env.AUTH_ISSUER_URL.trim())) {
  throw new Error(
    "AUTH_ISSUER_URL is not set on this deployment. Set it to the deployment's HTTP-actions URL (…convex.site or port + 1) before deploying.",
  );
}

const providers: AuthConfig["providers"] = [
  {
    // Admin: custom JWT provider (explicit JWKS URL, not OIDC discovery).
    type: "customJwt" as const,
    applicationID: ADMIN_APPLICATION_ID,
    issuer: ADMIN_ISSUER,
    algorithm: "ES256" as const,
    jwks: `${process.env.AUTH_ISSUER_URL}/.well-known/jwks.json`,
  },
  {
    type: "customJwt" as const,
    applicationID: ADMIN_APPLICATION_ID,
    issuer: MANAGEMENT_ISSUER,
    algorithm: "ES256" as const,
    jwks: `${process.env.AUTH_ISSUER_URL}/.well-known/jwks.json`,
  },
];

/**
 * Convex evaluates this file on the server and rejects the push
 * (AuthConfigMissingEnvironmentVariable) when an unset variable is read
 * directly. A fresh install has no Clerk yet, so probe membership before
 * reading; the Clerk provider is added as soon as the variable exists.
 */
function optionalEnv(name: string): string | undefined {
  // The server's process.env for auth-config evaluation is not enumerable
  // (Object.keys / `in` report nothing even for set variables) and throws on
  // a missing variable, so read directly and treat a throw as "not set".
  try {
    const value = (process.env as Record<string, string | undefined>)[name];
    return value && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

const clerkIssuerDomain = optionalEnv("CLERK_JWT_ISSUER_DOMAIN");

if (clerkIssuerDomain) {
  providers.push({
    // Website: optional Clerk provider. Fresh desktop/server installs must not
    // require Clerk just to create and sign in the first local admin.
    domain: clerkIssuerDomain,
    applicationID: "convex",
  });
}

export default { providers } satisfies AuthConfig;
