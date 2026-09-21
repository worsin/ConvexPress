import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { requireAuth } from "../helpers/auth";
import { assertStoredAccess } from "../rbac/functions";
export type HostingScope = {
  organizationId: Id<"overseer_organizations">;
  businessId?: Id<"overseer_businesses">;
};
export function hostingCredentialAad(
  input: HostingScope & { provider: string; externalAccountId: string },
): string {
  return JSON.stringify([
    "convexpress-hosting-v1",
    input.organizationId,
    input.businessId ?? null,
    input.provider,
    input.externalAccountId,
  ]);
}
export async function requireHostingAccess(ctx: QueryCtx | MutationCtx, scope: HostingScope) {
  const operator = await requireAuth(ctx);
  // Site/customer capability grants do not grant agency provider custody.
  if (!["owner", "admin"].includes(operator.role))
    throw Error("Hosting accounts are restricted to agency owners and administrators");
  const organization = await ctx.db.get(scope.organizationId);
  if (!organization?.isActive) throw Error("Hosting organization is not active");
  if (scope.businessId) {
    const business = await ctx.db.get(scope.businessId);
    if (!business?.isActive || business.organizationId !== organization._id)
      throw Error("Hosting business is not active in this organization");
  }
  await assertStoredAccess(ctx, operator, {
    selector: { type: "capability", code: "connection.manage" },
    target: {
      organizationId: String(scope.organizationId),
      ...(scope.businessId ? { businessId: String(scope.businessId) } : {}),
    },
  });
  return operator;
}
export async function requireHostingAccount(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"overseer_hostingAccounts">,
  websiteId?: Id<"overseer_websites">,
) {
  const account = await ctx.db.get(accountId);
  if (!account) throw Error("Hosting account not found");
  const operator = await requireHostingAccess(ctx, account);
  if (account.status !== "active" || !account.credentials)
    throw Error("Hosting account is revoked or unavailable");
  if (websiteId) {
    const website = await ctx.db.get(websiteId);
    if (
      !website ||
      website.status !== "active" ||
      website.organization_id !== account.organizationId ||
      !website.business_id ||
      (account.businessId && website.business_id !== account.businessId)
    )
      throw Error("Website does not belong to this hosting account scope");
    const business = await ctx.db.get(website.business_id);
    if (!business?.isActive || business.organizationId !== account.organizationId)
      throw Error("Website business is not active");
    await assertStoredAccess(ctx, operator, {
      selector: { type: "capability", code: "site.deploy" },
      target: {
        organizationId: String(account.organizationId),
        businessId: String(website.business_id),
        websiteId: String(website._id),
      },
    });
  }
  return { account, operator };
}
export function publicHostingAccount(account: Doc<"overseer_hostingAccounts">) {
  return {
    accountId: account._id,
    organizationId: account.organizationId,
    businessId: account.businessId ?? null,
    provider: account.provider,
    externalAccountId: account.externalAccountId,
    label: account.label,
    status: account.status,
    credentialKind: account.credentialKind ?? "legacy" as const,
    credentialState: (account.credentialKind === "api_token" && (account.credentialExpiresAt ?? Infinity) <= Date.now()) || (account.credentialState === "refreshing" && !account.pendingCredentials && (account.refreshLeaseUntil ?? 0) <= Date.now()) ? "reconnect" as const : account.credentialState ?? "ready" as const,
    credentialExpiresAt: account.credentialExpiresAt ?? null,
    credentialGeneration: account.credentialGeneration ?? 0,
    verifiedAt: account.verifiedAt,
    revision: account.revision,
  };
}
