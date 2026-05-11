"use node";

/**
 * PRD C2 UPS authentication — port of legacy actions.ts:111-186.
 * OAuth 2.0 Basic Auth, x-merchant-id header for account-specific rates.
 * Adds 4h token cache (legacy fetched fresh on every call).
 */

import { ConvexError } from "convex/values";

import type { ActionCtx } from "../../../_generated/server";
import { internal } from "../../../_generated/api";
import { getShippingProviderSettings } from "../../helpers/settings";
import { getDecryptedProviderPayload } from "../_shared/credentials";

export type UpsCredentials = {
  clientId: string;
  clientSecret: string;
  accountNumber: string;
  apiBaseUrl: string;
};

const PROD_BASE = "https://onlinetools.ups.com";
const SANDBOX_BASE = "https://wwwcie.ups.com";

// Cross-invocation OAuth token cache via shipping_provider_oauth_tokens table
// (Tier 1.1). Replaces the prior in-process Map. Multiple concurrent rate
// calls now share a single OAuth fetch per (connection, TTL window).
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export async function getUpsCredentialsV2(ctx: ActionCtx): Promise<UpsCredentials> {
  const payload = await getDecryptedProviderPayload(ctx, "ups");
  const providerSettings = await getShippingProviderSettings(ctx, "ups");

  const clientId = payload.clientId;
  const clientSecret = payload.clientSecret;
  const accountNumber = payload.accountNumber;
  const customBaseUrl = payload.apiBaseUrl;

  if (!clientId || !clientSecret || !accountNumber) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "UPS credentials are incomplete. Client ID, Client Secret, and Account Number are required.",
    });
  }

  const apiBaseUrl = (
    customBaseUrl ?? (providerSettings.mode === "production" ? PROD_BASE : SANDBOX_BASE)
  ).replace(/\/+$/, "");

  return { clientId, clientSecret, accountNumber, apiBaseUrl };
}

export async function getUpsAccessTokenV2(
  ctx: ActionCtx,
): Promise<{ accessToken: string; credentials: UpsCredentials }> {
  const credentials = await getUpsCredentialsV2(ctx);

  // Look up the connection row to scope the cache.
  const connection = await ctx.runQuery(
    internal.shipping.providers._shared.tokenCache.findConnectionByProvider,
    { provider: "ups" },
  );
  if (connection) {
    const cached = await ctx.runQuery(
      internal.shipping.providers._shared.tokenCache.getCachedToken,
      { connectionId: connection._id },
    );
    if (cached && cached.expiresAt > Date.now() + REFRESH_BUFFER_MS) {
      return { accessToken: cached.accessToken, credentials };
    }
  }

  const basicAuth = Buffer.from(
    `${credentials.clientId}:${credentials.clientSecret}`,
    "utf8",
  ).toString("base64");

  const tokenResponse = await fetch(
    `${credentials.apiBaseUrl}/security/v1/oauth/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "x-merchant-id": credentials.accountNumber,
      },
      body: "grant_type=client_credentials",
    },
  );

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "ups",
      status: tokenResponse.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(tokenResponse.status),
      lastErrorMessage: body.slice(0, 500),
    });
    throw new ConvexError({
      code: "UPS_AUTH_ERROR",
      message: body.slice(0, 500) || "Failed to authenticate with UPS.",
    });
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string;
    accessToken?: string;
    token?: string;
    expires_in?: number;
  };
  const accessToken =
    tokenPayload.access_token ?? tokenPayload.accessToken ?? tokenPayload.token;
  if (!accessToken) {
    throw new ConvexError({
      code: "UPS_AUTH_ERROR",
      message: "UPS authentication response did not include an access token.",
    });
  }

  const expiresInMs = tokenPayload.expires_in
    ? tokenPayload.expires_in * 1000
    : TOKEN_TTL_MS;

  if (connection) {
    await ctx.runMutation(
      internal.shipping.providers._shared.tokenCache.setCachedToken,
      {
        connectionId: connection._id,
        provider: "ups",
        accessToken,
        expiresAt: Date.now() + expiresInMs,
      },
    );
  }

  return { accessToken, credentials };
}
