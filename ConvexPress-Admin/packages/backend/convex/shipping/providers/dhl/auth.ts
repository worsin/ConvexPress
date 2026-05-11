"use node";

/**
 * PRD C5 DHL Express authentication — port of legacy actions.ts:290-321.
 * HTTP Basic Auth (no OAuth, no token caching needed).
 */

import { ConvexError } from "convex/values";

import type { ActionCtx } from "../../../_generated/server";
import { getShippingProviderSettings } from "../../helpers/settings";
import { getDecryptedProviderPayload } from "../_shared/credentials";

export type DhlCredentials = {
  username: string;
  password: string;
  accountNumber: string;
  apiBaseUrl: string;
};

const PROD_BASE = "https://express.api.dhl.com/mydhlapi";
const SANDBOX_BASE = "https://express.api.dhl.com/mydhlapi/test";

export async function getDhlCredentialsV2(ctx: ActionCtx): Promise<DhlCredentials> {
  const payload = await getDecryptedProviderPayload(ctx, "dhl");
  const providerSettings = await getShippingProviderSettings(ctx, "dhl");

  const username = payload.username;
  const password = payload.password;
  const accountNumber = payload.accountNumber;
  const customBaseUrl = payload.apiBaseUrl;

  if (!username || !password || !accountNumber) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "DHL credentials are incomplete. Username, Password, and Account Number are required.",
    });
  }

  const apiBaseUrl = (
    customBaseUrl ?? (providerSettings.mode === "production" ? PROD_BASE : SANDBOX_BASE)
  ).replace(/\/+$/, "");

  return { username, password, accountNumber, apiBaseUrl };
}

export function getDhlBasicAuth(credentials: { username: string; password: string }): string {
  return Buffer.from(
    `${credentials.username}:${credentials.password}`,
    "utf8",
  ).toString("base64");
}
