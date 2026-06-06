import type { AuthConfig } from "convex/server";

const ADMIN_APPLICATION_ID = "convexpress-admin";
const ADMIN_ISSUER = "https://convexpress-admin.local";

const providers: AuthConfig["providers"] = [
  {
    // Admin: custom JWT provider (explicit JWKS URL, not OIDC discovery).
    type: "customJwt" as const,
    applicationID: ADMIN_APPLICATION_ID,
    issuer: ADMIN_ISSUER,
    algorithm: "ES256" as const,
    jwks: `${process.env.AUTH_ISSUER_URL}/.well-known/jwks.json`,
  },
];

const clerkIssuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN?.trim();

if (clerkIssuerDomain) {
  providers.push({
    // Website: optional Clerk provider. Fresh desktop/server installs must not
    // require Clerk just to create and sign in the first local admin.
    domain: clerkIssuerDomain,
    applicationID: "convex",
  });
}

export default { providers } satisfies AuthConfig;
