"use node";

/**
 * Shared credential decryption for v2 provider modules.
 *
 * `internal.shipping.internals.getProviderSecret` returns
 * `{ connection, secret: { encryptedPayload } }`. The payload is encrypted
 * with SHIPPING_PROVIDER_ENCRYPTION_KEY and must be decrypted before the
 * individual fields (clientId, clientSecret, apiKey, etc.) are usable.
 *
 * The legacy `shipping/actions.ts` has `getProviderSecretPayload` for this;
 * this module is its v2 equivalent so every new provider module can call
 * `getDecryptedProviderPayload(ctx, "usps")` instead of dereferencing
 * `secret.secret?.clientId` which is always undefined in production.
 */

import { ConvexError } from "convex/values";

import type { ActionCtx } from "../../../_generated/server";
import { internal } from "../../../_generated/api";
import { decryptSecret } from "../../../api/crypto_helpers";

const SHIPPING_ENCRYPTION_KEY = process.env.SHIPPING_PROVIDER_ENCRYPTION_KEY;

export async function getDecryptedProviderPayload(
  ctx: ActionCtx,
  provider: "shipstation" | "ups" | "usps" | "fedex" | "dhl",
): Promise<Record<string, string | undefined>> {
  const secretState = await ctx.runQuery(
    internal.shipping.internals.getProviderSecret,
    { provider },
  );

  if (!secretState?.secret?.encryptedPayload) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: `${provider.toUpperCase()} credentials have not been saved yet.`,
    });
  }

  if (!SHIPPING_ENCRYPTION_KEY) {
    throw new ConvexError({
      code: "CONFIG_ERROR",
      message: "SHIPPING_PROVIDER_ENCRYPTION_KEY is not configured.",
    });
  }

  const decrypted = await decryptSecret(
    secretState.secret.encryptedPayload,
    SHIPPING_ENCRYPTION_KEY,
  );

  return JSON.parse(decrypted) as Record<string, string | undefined>;
}
