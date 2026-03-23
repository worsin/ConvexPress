/**
 * Auth System - JWKS Endpoint HTTP Action
 *
 * Handles GET /.well-known/jwks.json
 * Returns the public key set used to verify access tokens.
 *
 * This endpoint is public — consumers (Website app, API clients) use it
 * to fetch the public key for JWT verification without needing credentials.
 *
 * Cached for 1 hour (Cache-Control: public, max-age=3600).
 * Runs in Node.js runtime — has access to process.env (needed for AUTH_PRIVATE_KEY).
 */

import { httpAction } from "../_generated/server";
import { getJWKS } from "./helpers";

export const jwksHandler = httpAction(async () => {
  const jwks = await getJWKS();

  return new Response(JSON.stringify(jwks), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
