import { v } from "convex/values";
import { deploymentOriginSchema } from "@convexpress/site-contract";
import { authenticatedMutation, authenticatedQuery, assertStoredAccess } from "../rbac/functions";
import { requireHostingAccount } from "./policy";
import {
  attachWebsiteInstance,
  summarizeWebsiteInstance,
  websiteInstanceResult,
} from "../websiteInstances";
export const attach = authenticatedMutation({
  args: {
    receiptId: v.id("overseer_hostingProvisioning"),
    productionSiteOrigin: v.string(),
    stagingSiteOrigin: v.string(),
  },
  returns: v.object({ production: websiteInstanceResult, staging: websiteInstanceResult }),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt || receipt.state !== "succeeded")
      throw Error("Confirm cloud provisioning before attaching environments");
    const { account, operator } = await requireHostingAccount(
      ctx,
      receipt.accountId,
      receipt.websiteId,
    );
    if (account.provider !== "convex")
      throw Error("Only a confirmed Convex project can supply these databases");
    const website = (await ctx.db.get(receipt.websiteId))!;
    const target = {
      organizationId: String(website.organization_id),
      businessId: String(website.business_id),
      websiteId: String(website._id),
    };
    for (const code of ["website.update", "environment.live.operate"])
      await assertStoredAccess(ctx, operator, { selector: { type: "capability", code }, target });
    const origins = {
      production: deploymentOriginSchema.parse(args.productionSiteOrigin),
      staging: deploymentOriginSchema.parse(args.stagingSiteOrigin),
    };
    if (origins.production === origins.staging)
      throw Error("Production and staging must have different website origins");
    for (const origin of Object.values(origins))
      if (!origin.startsWith("https://")) throw Error("Cloud website origins must use HTTPS");
    const rows = await ctx.db
      .query("overseer_hostingProvisioningSteps")
      .withIndex("by_receipt_step", (q) => q.eq("receiptId", receipt._id))
      .take(17);
    const confirmed = (step: string) => {
      const matches = rows.filter((row) => row.step === step && row.state === "confirmed");
      const row = matches[0];
      if (
        matches.length !== 1 ||
        !row.externalId ||
        row.provider !== "convex" ||
        row.providerAccountId !== account.externalAccountId ||
        row.websiteId !== website._id
      )
        throw Error("Cloud receipt target identity does not match this website");
      return row;
    };
    const project = confirmed("project");
    const production = confirmed("production"),
      staging = confirmed("staging");
    if (!/^\d+$/.test(project.externalId!) || production.externalId === staging.externalId)
      throw Error("Cloud receipt must identify one project and two independent databases");
    const prior = await ctx.db
      .query("overseer_hostingAttachments")
      .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
      .unique();
    const ensure = async (kind: "production" | "staging", step: typeof production) => {
      if (!/^[a-z0-9-]{1,128}$/.test(step.externalId!))
        throw Error("Invalid cloud deployment identity");
      const owners = await ctx.db
        .query("overseer_hostingProvisioningSteps")
        .withIndex("by_resource", (q) =>
          q
            .eq("provider", "convex")
            .eq("providerAccountId", account.externalAccountId)
            .eq("resourceKind", "deployment")
            .eq("externalId", step.externalId),
        )
        .take(2);
      if (owners.length !== 1 || owners[0]._id !== step._id)
        throw Error("Cloud database ownership is ambiguous");
      const deploymentOrigin = `https://${step.externalId}.convex.cloud`,
        managementOrigin = `https://${step.externalId}.convex.site`;
      const matches = await ctx.db
        .query("overseer_websiteInstances")
        .withIndex("by_deployment_origin", (q) => q.eq("deploymentOrigin", deploymentOrigin))
        .take(3);
      const existing = matches.filter((row) => row.status === "active");
      const expectedId = prior
        ? kind === "production"
          ? prior.productionInstanceId
          : prior.stagingInstanceId
        : null;
      if (expectedId && !existing.some((row) => row._id === expectedId))
        throw Error(
          "Previously attached environment changed or was archived; reconcile it before continuing",
        );
      if (existing.length) {
        const row = existing[0];
        if (
          existing.length !== 1 ||
          row.website_id !== website._id ||
          row.organization_id !== website.organization_id ||
          row.business_id !== website.business_id ||
          row.kind !== (kind === "production" ? "live" : "staging") ||
          row.managementOrigin !== managementOrigin ||
          row.siteOrigin !== origins[kind] ||
          row.deploymentName !== step.externalId ||
          row.projectRef !== project.externalId
        )
          throw Error(
            "This cloud deployment is already attached with a different website or target identity",
          );
        return summarizeWebsiteInstance(row);
      }
      return attachWebsiteInstance(
        { ...ctx, operator },
        {
          websiteId: website._id,
          instanceKey: `cloud_${step.externalId!.replaceAll("-", "_")}_${kind}`,
          kind: kind === "production" ? "live" : "staging",
          label: kind === "production" ? "Production" : "Staging",
          deploymentOrigin,
          managementOrigin,
          siteOrigin: origins[kind],
          deploymentName: step.externalId,
          projectRef: project.externalId,
          makeDefault: kind === "production",
        },
      );
    };
    const result = {
      production: await ensure("production", production),
      staging: await ensure("staging", staging),
    };
    if (prior) {
      if (prior.accountId !== account._id || prior.websiteId !== website._id)
        throw Error("Hosting attachment ownership mismatch");
    } else
      await ctx.db.insert("overseer_hostingAttachments", {
        receiptId: receipt._id,
        accountId: account._id,
        websiteId: website._id,
        productionInstanceId: result.production.instanceId,
        stagingInstanceId: result.staging.instanceId,
        createdAt: Date.now(),
      });
    return result;
  },
});

export const get = authenticatedQuery({
  args: { receiptId: v.id("overseer_hostingProvisioning") },
  returns: v.union(
    v.object({ production: websiteInstanceResult, staging: websiteInstanceResult }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) throw Error("Hosting receipt not found");
    await requireHostingAccount(ctx, receipt.accountId, receipt.websiteId);
    const attachment = await ctx.db
      .query("overseer_hostingAttachments")
      .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
      .unique();
    if (!attachment) return null;
    const production = await ctx.db.get(attachment.productionInstanceId),
      staging = await ctx.db.get(attachment.stagingInstanceId);
    if (
      !production ||
      !staging ||
      production.website_id !== receipt.websiteId ||
      staging.website_id !== receipt.websiteId
    )
      throw Error("Hosting attachment identity mismatch");
    return {
      production: summarizeWebsiteInstance(production),
      staging: summarizeWebsiteInstance(staging),
    };
  },
});
