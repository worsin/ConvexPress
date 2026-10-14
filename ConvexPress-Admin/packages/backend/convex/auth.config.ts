import type { AuthConfig } from "convex/server";
import { ADMIN_ISSUER, MANAGEMENT_ISSUER, clerkIssuerDomain } from "./auth/issuers";

const ADMIN_APPLICATION_ID = "convexpress-admin";

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
 * directly. A fresh install has no Clerk yet, so `clerkIssuerDomain` probes
 * the variable without throwing; the Clerk provider is added as soon as it
 * exists. `helpers/permissions.ts` reads the same helper, so a Clerk identity
 * is only accepted from this exact issuer.
 *
 * Integrators that embed ConvexPress may append their own staff identity
 * provider here. Its identities resolve only through server-side links in
 * `userExternalIdentities` (see `users/externalIdentities.ts`).
 */
const clerkDomain = clerkIssuerDomain();

if (clerkDomain) {
  providers.push({
    // Website: optional Clerk provider. Fresh desktop/server installs must not
    // require Clerk just to create and sign in the first local admin.
    domain: clerkDomain,
    applicationID: "convex",
  });
}

export default { providers } satisfies AuthConfig;
