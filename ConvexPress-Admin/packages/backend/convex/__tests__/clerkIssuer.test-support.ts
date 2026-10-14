import { afterAll, beforeAll } from "bun:test";

/**
 * getCurrentUser accepts a Clerk identity only when its issuer equals the
 * deployment's CLERK_JWT_ISSUER_DOMAIN (auth/issuers.ts). Call this at the top
 * level of a test file whose fixtures sign in as Clerk users, with the issuer
 * those identities carry. The previous value is restored after the file.
 */
export function useClerkIssuer(issuer: string): void {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.CLERK_JWT_ISSUER_DOMAIN;
    process.env.CLERK_JWT_ISSUER_DOMAIN = issuer;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.CLERK_JWT_ISSUER_DOMAIN;
    else process.env.CLERK_JWT_ISSUER_DOMAIN = previous;
  });
}

/** A Clerk-shaped identity whose issuer, subject and tokenIdentifier agree. */
export function clerkIdentity(issuer: string, subject: string): { issuer: string; subject: string; tokenIdentifier: string } {
  return { issuer, subject, tokenIdentifier: `${issuer}|${subject}` };
}
