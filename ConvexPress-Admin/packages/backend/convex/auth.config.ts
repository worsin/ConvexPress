export default {
  providers: [
    {
      // Admin: custom JWT provider (explicit JWKS URL, not OIDC discovery)
      type: "customJwt" as const,
      issuer: "smithharper-admin",
      algorithm: "ES256" as const,
      jwks: `${process.env.AUTH_ISSUER_URL}/.well-known/jwks.json`,
    },
    {
      // Website: Clerk provider
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};
