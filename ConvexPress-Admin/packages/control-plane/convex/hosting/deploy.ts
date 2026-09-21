"use node";
import { randomUUID } from "node:crypto";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { operatorAction } from "../rbac/functions";
import {
  decryptCredentialPayload,
  encryptCredentialPayload,
  parseEnvelopeKey,
  parseEnvelopeKeys,
} from "../connections/crypto";
import { hostingCredentialAad } from "./policy";
import { ConvexCloudApi, ProviderApiError } from "./providerApi";

const aad = (instanceId: string, receiptId: string, deploymentName: string) =>
  JSON.stringify(["convexpress-cloud-deploy-v1", instanceId, receiptId, deploymentName]);

/** Desktop main-process only caller: operator authentication and all target
 * permissions are checked again for every release of the deployment-only key.
 * Provider account tokens never leave the control plane. */
export const credential = operatorAction({
  args: { instanceId: v.id("overseer_websiteInstances") },
  returns: v.union(
    v.null(),
    v.object({
      deploymentAdminKey: v.string(),
      websiteKey: v.string(),
      instanceKey: v.string(),
      environmentKind: v.string(),
      deploymentOrigin: v.string(),
      managementOrigin: v.string(),
      siteOrigin: v.string(),
    }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<null | {
    deploymentAdminKey: string;
    websiteKey: string;
    instanceKey: string;
    environmentKind: string;
    deploymentOrigin: string;
    managementOrigin: string;
    siteOrigin: string;
  }> => {
    const target = await ctx.runQuery(internal.hosting.deploymentCredentials.prepare, args);
    if (!target) return null;
    const associatedData = aad(args.instanceId, target.receiptId, target.deploymentName);
    let key: string;
    if (target.stored?.state === "ready" && target.stored.envelope) {
      const payload = decryptCredentialPayload({
        envelope: target.stored.envelope,
        key: parseEnvelopeKey(
          process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS,
          target.stored.envelope.version,
        ),
        aad: associatedData,
      });
      if (typeof payload.deployKey !== "string")
        throw Error("Stored deployment credential is invalid");
      key = payload.deployKey;
    } else {
      // Verify encryption and provider identity before recording a write intent.
      const keys = parseEnvelopeKeys({
        serializedKeys: process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS,
        activeVersion: process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION,
      });
      const receipt = await ctx.runQuery(internal.hosting.provisioning.get, {
        receiptId: target.receiptId,
      });
      const account = await ctx.runQuery(internal.hosting.accounts.prepareUse, {
        accountId: target.accountId,
        websiteId: receipt.websiteId,
      });
      if (account.revision !== target.accountRevision || account.provider !== "convex")
        throw Error("Cloud account changed during setup");
      const payload = decryptCredentialPayload({
        envelope: account.credentials,
        key: parseEnvelopeKey(
          process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS,
          account.credentials.version,
        ),
        aad: hostingCredentialAad({ ...account, businessId: account.businessId ?? undefined }),
      });
      if (typeof payload.token !== "string") throw Error("Reconnect the Convex account");
      const provider = new ConvexCloudApi(payload.token);
      if (String((await provider.tokenDetails()).teamId) !== account.externalAccountId)
        throw Error("Convex team identity changed");
      const deployments = await provider.listDeployments(target.projectId);
      if (
        !deployments.some(
          (d) =>
            d.name === target.deploymentName &&
            d.deploymentUrl === target.deploymentOrigin &&
            d.reference === (target.environmentKind === "live" ? "production" : "staging"),
        )
      )
        throw Error("Cloud deployment identity changed");
      const claim = await ctx.runMutation(internal.hosting.deploymentCredentials.claim, {
        ...args,
        accountRevision: target.accountRevision,
      });
      if (!claim.create)
        throw Error(
          "Deployment credential creation is pending reconciliation. No duplicate key was created.",
        );
      try {
        key = await provider.createDeployKey(
          target.deploymentName,
          `ConvexPress ${claim.credentialId}${claim.generation ? ` attempt ${claim.generation}` : ""}`,
        );
      } catch (cause) {
        if (
          cause instanceof ProviderApiError &&
          !cause.uncertain &&
          [400, 401, 403, 404, 422, 429].includes(cause.status)
        )
          await ctx.runMutation(internal.hosting.deploymentCredentials.rejected, {
            credentialId: claim.credentialId,
            generation: claim.generation,
          });
        throw cause;
      }
      const envelope = encryptCredentialPayload({
        payload: { deployKey: key },
        key: keys.key,
        keyVersion: keys.activeVersion,
        aad: associatedData,
      });
      await ctx.runMutation(internal.hosting.deploymentCredentials.commit, {
        credentialId: claim.credentialId,
        generation: claim.generation,
        envelope,
      });
    }
    if (
      !key.startsWith(
        `${target.environmentKind === "live" ? "prod" : "dev"}:${target.deploymentName}|`,
      )
    )
      throw Error("Deployment credential does not match its environment");
    // A scope/revocation change during provider I/O must prevent credential release.
    const current = await ctx.runQuery(internal.hosting.deploymentCredentials.prepare, args);
    if (
      !current ||
      current.accountRevision !== target.accountRevision ||
      current.receiptId !== target.receiptId ||
      current.deploymentOrigin !== target.deploymentOrigin ||
      current.siteOrigin !== target.siteOrigin
    )
      throw Error("Environment changed during credential preparation");
    return {
      deploymentAdminKey: key,
      websiteKey: current.websiteKey,
      instanceKey: current.instanceKey,
      environmentKind: current.environmentKind,
      deploymentOrigin: current.deploymentOrigin,
      managementOrigin: current.managementOrigin,
      siteOrigin: current.siteOrigin,
    };
  },
});

/** Explicit operator recovery. Metadata cannot recover the old secret; only
 * this receipt's uniquely named orphan may be revoked. Never rotates ready keys. */
export const recoverCredential = operatorAction({
  args: {
    instanceId: v.id("overseer_websiteInstances"),
    credentialId: v.id("overseer_hostingDeploymentCredentials"),
    confirmationDeploymentName: v.string(),
  },
  returns: v.object({ state: v.literal("retry_ready") }),
  handler: async (ctx, args): Promise<{ state: "retry_ready" }> => {
    const target = await ctx.runQuery(internal.hosting.deploymentCredentials.prepare, {
      instanceId: args.instanceId,
    });
    if (!target || target.stored?.credentialId !== args.credentialId)
      throw Error("Credential recovery target changed");
    if (target.stored.state === "ready" || target.stored.state === "rejected")
      throw Error("Credential is already ready or ready to retry");
    if (args.confirmationDeploymentName !== target.deploymentName)
      throw Error("Deployment name confirmation does not match");
    const receipt = await ctx.runQuery(internal.hosting.provisioning.get, {
      receiptId: target.receiptId,
    });
    const account = await ctx.runQuery(internal.hosting.accounts.prepareUse, {
      accountId: target.accountId,
      websiteId: receipt.websiteId,
    });
    if (account.revision !== target.accountRevision || account.provider !== "convex")
      throw Error("Cloud account changed during recovery");
    const payload = decryptCredentialPayload({
      envelope: account.credentials,
      key: parseEnvelopeKey(
        process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS,
        account.credentials.version,
      ),
      aad: hostingCredentialAad({ ...account, businessId: account.businessId ?? undefined }),
    });
    if (typeof payload.token !== "string") throw Error("Reconnect the Convex account");
    const provider = new ConvexCloudApi(payload.token);
    if (String((await provider.tokenDetails()).teamId) !== account.externalAccountId)
      throw Error("Convex team identity changed");
    // A team-scoped list must still contain the receipt project before we touch a key.
    if (
      !(await provider.listProjects(Number(account.externalAccountId))).some(
        (p) => p.id === target.projectId,
      )
    )
      throw Error("Convex project no longer belongs to its account");
    const deployments = await provider.listDeployments(target.projectId);
    if (
      !deployments.some(
        (d) =>
          d.projectId === target.projectId &&
          d.name === target.deploymentName &&
          d.deploymentUrl === target.deploymentOrigin &&
          d.reference === (target.environmentKind === "live" ? "production" : "staging"),
      )
    )
      throw Error("Cloud deployment identity changed");
    const lease = randomUUID();
    const claim = await ctx.runMutation(internal.hosting.deploymentCredentials.claimRecovery, {
      ...args,
      accountRevision: target.accountRevision,
      lease,
    });
    const guard = { credentialId: args.credentialId, generation: claim.generation, lease };
    const matches = (await provider.listDeployKeys(target.deploymentName)).filter(
      (k) => k.name === claim.keyName,
    );
    if (matches.length > 1)
      throw Error(
        "Credential key name is ambiguous; inspect this request in Convex before recovery",
      );
    await ctx.runQuery(internal.hosting.deploymentCredentials.assertRecovery, guard);
    if (matches.length === 1) {
      await provider.deleteDeployKeyByName(target.deploymentName, claim.keyName);
      // A success status alone is insufficient to unlock another issuance.
      if (
        (await provider.listDeployKeys(target.deploymentName)).some((k) => k.name === claim.keyName)
      )
        throw Error("Credential revocation could not be confirmed; no replacement key was created");
    }
    await ctx.runMutation(internal.hosting.deploymentCredentials.finishRecovery, guard);
    return { state: "retry_ready" };
  },
});
