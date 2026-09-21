"use node";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { operatorAction } from "../rbac/functions";
import { hostingProvider } from "../schema/hosting";
import { encryptCredentialPayload, parseEnvelopeKeys } from "../connections/crypto";
import { hostingCredentialAad } from "./policy";
import { ConvexCloudApi, CloudflareApi, VercelApi } from "./providerApi";
export const connect = operatorAction({
  args: {
    organizationId: v.id("overseer_organizations"),
    businessId: v.optional(v.id("overseer_businesses")),
    provider: hostingProvider,
    externalAccountId: v.string(),
    token: v.string(),
    expectedRevision: v.number(),
    cloudflareTokenKind: v.optional(v.union(v.literal("user"), v.literal("account"))),
  },
  returns: v.object({
    accountId: v.id("overseer_hostingAccounts"),
    provider: hostingProvider,
    externalAccountId: v.string(),
    label: v.string(),
    revision: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    accountId: Id<"overseer_hostingAccounts">;
    provider: "convex" | "cloudflare" | "vercel";
    externalAccountId: string;
    label: string;
    revision: number;
  }> => {
    const { token, cloudflareTokenKind, ...metadata } = args;
    if (token.length < 16 || token.length > 16384 || /[\u0000-\u001f\u007f]/.test(token))
      throw Error("Provider token is invalid");
    await ctx.runQuery(internal.hosting.accounts.prepareSave, metadata);
    try {
      const client =
        args.provider === "convex"
          ? new ConvexCloudApi(token)
          : args.provider === "cloudflare"
            ? new CloudflareApi(token, args.externalAccountId)
            : new VercelApi(
                token,
                args.externalAccountId.startsWith("team_") ? args.externalAccountId : undefined,
              );
      const verified = await client.verifyIdentity();
      const lifetime = args.provider === "cloudflare" ? await (client as CloudflareApi).verifyApiToken(cloudflareTokenKind ?? "user") : null;
      if (verified.provider !== args.provider || verified.accountId !== args.externalAccountId)
        throw Error("mismatch");
      const keys = parseEnvelopeKeys({
        serializedKeys: process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS,
        activeVersion: process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION,
      });
      const credentials = encryptCredentialPayload({
        payload: { token },
        key: keys.key,
        keyVersion: keys.activeVersion,
        aad: hostingCredentialAad(args),
      });
      const result = await ctx.runMutation(internal.hosting.accounts.commitVerified, {
        ...metadata,
        label: verified.label,
        credentials,
        ...(lifetime ? { credentialKind: "api_token" as const, credentialExpiresAt: lifetime.expiresAt } : {}),
      });
      return {
        accountId: result.accountId,
        provider: result.provider,
        externalAccountId: result.externalAccountId,
        label: result.label,
        revision: result.revision,
      };
    } catch {
      throw Error(
        args.provider === "cloudflare" ? "Cloudflare API token verification failed. Use an active account or user API token of the selected kind, with the required account permissions. Browser and Wrangler OAuth access tokens must use Connect with Cloudflare instead." : "Hosting account verification failed. Check the selected account ID, token permissions, and connection encryption configuration.",
      );
    }
  },
});
