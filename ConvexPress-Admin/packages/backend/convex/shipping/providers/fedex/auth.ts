"use node";

/**
 * PRD C4 FedEx authentication — port of legacy actions.ts:264-372.
 * OAuth 2.0 with form-encoded body. Adds 1h token cache (legacy didn't cache).
 */

import { ConvexError } from "convex/values";

import type { ActionCtx } from "../../../_generated/server";
import { internal } from "../../../_generated/api";
import { getShippingProviderSettings } from "../../helpers/settings";
import { getDecryptedProviderPayload } from "../_shared/credentials";

export type FedexCredentials = {
  clientId: string;
  clientSecret: string;
  accountNumber: string;
  apiBaseUrl: string;
};

const PROD_BASE = "https://apis.fedex.com";
const SANDBOX_BASE = "https://apis-sandbox.fedex.com";

// Cross-invocation OAuth token cache via shipping_provider_oauth_tokens table
// (Tier 1.1). Replaces the prior in-process Map.
const TOKEN_TTL_MS = 60 * 60 * 1000; // FedEx tokens 1h
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export async function getFedexCredentialsV2(ctx: ActionCtx): Promise<FedexCredentials> {
  const payload = await getDecryptedProviderPayload(ctx, "fedex");
  const providerSettings = await getShippingProviderSettings(ctx, "fedex");

  const clientId = payload.clientId;
  const clientSecret = payload.clientSecret;
  const accountNumber = payload.accountNumber;
  const customBaseUrl = payload.apiBaseUrl;

  if (!clientId || !clientSecret || !accountNumber) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "FedEx credentials are incomplete. Client ID, Client Secret, and Account Number are required.",
    });
  }

  const apiBaseUrl = (
    customBaseUrl ?? (providerSettings.mode === "production" ? PROD_BASE : SANDBOX_BASE)
  ).replace(/\/+$/, "");

  return { clientId, clientSecret, accountNumber, apiBaseUrl };
}

export async function getFedexAccessTokenV2(
  ctx: ActionCtx,
): Promise<{ accessToken: string; credentials: FedexCredentials }> {
  const credentials = await getFedexCredentialsV2(ctx);

  const connection = await ctx.runQuery(
    internal.shipping.providers._shared.tokenCache.findConnectionByProvider,
    { provider: "fedex" },
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

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  });
  const tokenResponse = await fetch(`${credentials.apiBaseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!tokenResponse.ok) {
    const bodyText = await tokenResponse.text();
    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "fedex",
      status: tokenResponse.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(tokenResponse.status),
      lastErrorMessage: bodyText.slice(0, 500),
    });
    throw new ConvexError({
      code: "FEDEX_AUTH_ERROR",
      message: bodyText.slice(0, 500) || "Failed to authenticate with FedEx.",
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
      code: "FEDEX_AUTH_ERROR",
      message: "FedEx authentication response did not include an access token.",
    });
  }

  const expiresInMs = tokenPayload.expires_in ? tokenPayload.expires_in * 1000 : TOKEN_TTL_MS;

  if (connection) {
    await ctx.runMutation(
      internal.shipping.providers._shared.tokenCache.setCachedToken,
      {
        connectionId: connection._id,
        provider: "fedex",
        accessToken,
        expiresAt: Date.now() + expiresInMs,
      },
    );
  }

  return { accessToken, credentials };
}
