/** Internal policy reads. Paginated readers own separate journals; the block
 * batch uses bounded exact-index reads and refuses overflow before projection. */
import { ConvexError, v, getDocumentSize, type Value, type Validator } from "convex/values";
import type { PaginationResult, RegisteredQuery } from "convex/server";
import { internalQuery, type QueryCtx } from "../_generated/server";
import type { MeasuredPolicyPage } from "../helpers/requestReadLedger";
import type { Doc, Id } from "../_generated/dataModel";
import { membershipTables } from "../schema/membership";

export const POLICY_PAGE: Readonly<{
  cursor: null; numItems: number; maximumRowsRead: number; maximumBytesRead: number;
}> = Object.freeze({ cursor: null, numItems: 256, maximumRowsRead: 256, maximumBytesRead: 512 * 1024 });
export function requireCompletePolicyPage<T extends Record<string, Value>>(page: PaginationResult<T>): T[] {
  // A large final document may already have materialized. Refuse it explicitly
  // even if the server returns a complete-looking page without split metadata.
  const returnedBytes = page.page.reduce((bytes, row) => bytes + getDocumentSize(row), 0);
  // A split cursor with no split status is also returned for complete small
  // cloud pages. It does not invalidate an otherwise bounded, finished read.
  if (!page.isDone || page.pageStatus != null ||
      page.page.length > POLICY_PAGE.numItems || returnedBytes > POLICY_PAGE.maximumBytesRead) {
    throw new ConvexError({ code: "MEMBERSHIP_POLICY_BUDGET", message: "Membership policy exceeds the safe read budget; access cannot be determined." });
  }
  return page.page;
}
const rule = membershipTables.membership_restriction_rules.validator.fields;
const grant = membershipTables.membership_grants.validator.fields;
export type RuleResult = Pick<Doc<"membership_restriction_rules">, "resourceType" | "resourceIdOrKey" | "policyGroup" | "ruleMode" | "planIds" | "requiredCapabilities" | "teaserMode" | "customMessage" | "loginRequired">;
export type GrantResult = Pick<Doc<"membership_grants">, "planId" | "status" | "startsAt" | "endsAt" | "graceEndsAt" | "revokedAt">;
export const policyRuleValidator: Validator<RuleResult> = v.object({
  resourceType: rule.resourceType, resourceIdOrKey: rule.resourceIdOrKey, policyGroup: rule.policyGroup,
  ruleMode: rule.ruleMode, planIds: rule.planIds, requiredCapabilities: rule.requiredCapabilities,
  teaserMode: rule.teaserMode, customMessage: rule.customMessage, loginRequired: rule.loginRequired,
});
export const policyGrantValidator: Validator<GrantResult> = v.object({
  planId: grant.planId, status: grant.status, startsAt: grant.startsAt, endsAt: grant.endsAt, graceEndsAt: grant.graceEndsAt, revokedAt: grant.revokedAt,
});
export type RuleArgs = { resourceType: RuleResult["resourceType"]; resourceIdOrKey: string };
export type GrantArgs = { userId: Id<"users">; status: "active" | "grace" };
async function readRuleRows(ctx: QueryCtx, args: RuleArgs): Promise<Doc<"membership_restriction_rules">[]> {
  const query = ctx.db.query("membership_restriction_rules").withIndex("by_resource", q =>
    args.resourceType === "route" ? q.eq("resourceType", "route") : q.eq("resourceType", args.resourceType).eq("resourceIdOrKey", args.resourceIdOrKey));
  return requireCompletePolicyPage(await query.paginate(POLICY_PAGE));
}
async function readGrantRows(ctx: QueryCtx, args: GrantArgs): Promise<Doc<"membership_grants">[]> {
  return requireCompletePolicyPage(await ctx.db.query("membership_grants")
    .withIndex("by_user_status", q => q.eq("userId", args.userId).eq("status", args.status)).paginate(POLICY_PAGE));
}
function projectRules(rows: Doc<"membership_restriction_rules">[]): RuleResult[] {
  return rows.map(({ resourceType, resourceIdOrKey, policyGroup, ruleMode, planIds, requiredCapabilities, teaserMode, customMessage, loginRequired }) =>
    ({ resourceType, resourceIdOrKey, policyGroup, ruleMode, planIds, requiredCapabilities, teaserMode, customMessage, loginRequired }));
}
function projectGrants(rows: Doc<"membership_grants">[]): GrantResult[] {
  return rows.map(({ planId, status, startsAt, endsAt, graceEndsAt, revokedAt }) => ({ planId, status, startsAt, endsAt, graceEndsAt, revokedAt }));
}
const ruleArgs = { resourceType: rule.resourceType, resourceIdOrKey: v.string() };
const grantArgs = { userId: v.id("users"), status: v.union(v.literal("active"), v.literal("grace")) };
export const rules: RegisteredQuery<"internal", RuleArgs, Promise<RuleResult[]>> = internalQuery({
  args: ruleArgs, returns: v.array(policyRuleValidator),
  handler: async (ctx, args): Promise<RuleResult[]> => projectRules(await readRuleRows(ctx, args)),
});
export const grants: RegisteredQuery<"internal", GrantArgs, Promise<GrantResult[]>> = internalQuery({
  args: grantArgs, returns: v.array(policyGrantValidator),
  handler: async (ctx, args): Promise<GrantResult[]> => projectGrants(await readGrantRows(ctx, args)),
});
/** Internal measurement endpoints preserve the existing public policy DTOs while
 * reporting full materialized raw document bytes to the canonical request ledger.
 * The shared exact-index reader still refuses incomplete or oversized pages. */
export const measuredRules: RegisteredQuery<"internal", RuleArgs, Promise<MeasuredPolicyPage<RuleResult>>> = internalQuery({
  args: ruleArgs,
  returns: v.object({ items: v.array(policyRuleValidator), rows: v.number(), bytes: v.number() }),
  handler: async (ctx, args): Promise<MeasuredPolicyPage<RuleResult>> => {
    const rows = await readRuleRows(ctx, args);
    return { items: projectRules(rows), rows: rows.length, bytes: rows.reduce((sum, row) => sum + getDocumentSize(row), 0) };
  },
});

export type BlockRuleBatchArgs = { keys: string[] };
/** Coalesce exact indexed lookups, not a scan of unrelated site policy. The
 * child query bounds its own reads; the caller charges all raw rows/bytes. A
 * partial or overflowing target never becomes a cached empty/allowed policy. */
export const measuredBlockRules: RegisteredQuery<"internal", BlockRuleBatchArgs, Promise<MeasuredPolicyPage<RuleResult>>> = internalQuery({
  args: { keys: v.array(v.string()) },
  returns: v.object({ items: v.array(policyRuleValidator), rows: v.number(), bytes: v.number() }),
  handler: async (ctx, args) => {
    if (!args.keys.length || args.keys.length > 128 || args.keys.some(key => !key.length || key.length > 256) || new Set(args.keys).size !== args.keys.length)
      throw new ConvexError({ code: "MEMBERSHIP_POLICY_KEYS", message: "Block policy batches require up to 128 distinct bounded keys." });
    const rows: Doc<"membership_restriction_rules">[] = [];
    let bytes = 0;
    for (const key of args.keys) {
      const selected = await ctx.db.query("membership_restriction_rules")
        .withIndex("by_resource", q => q.eq("resourceType", "block").eq("resourceIdOrKey", key))
        .take(Math.min(POLICY_PAGE.numItems + 1, 2048 - rows.length + 1));
      bytes += selected.reduce((sum, row) => sum + getDocumentSize(row), 0);
      if (selected.length > POLICY_PAGE.numItems || rows.length + selected.length > 2048 || bytes > POLICY_PAGE.maximumBytesRead)
        throw new ConvexError({ code: "MEMBERSHIP_POLICY_BUDGET", message: "Membership policy exceeds the safe read budget; access cannot be determined." });
      rows.push(...selected);
    }
    return { items: projectRules(rows), rows: rows.length, bytes };
  },
});
export const measuredGrants: RegisteredQuery<"internal", GrantArgs, Promise<MeasuredPolicyPage<GrantResult>>> = internalQuery({
  args: grantArgs,
  returns: v.object({ items: v.array(policyGrantValidator), rows: v.number(), bytes: v.number() }),
  handler: async (ctx, args): Promise<MeasuredPolicyPage<GrantResult>> => {
    const rows = await readGrantRows(ctx, args);
    return { items: projectGrants(rows), rows: rows.length, bytes: rows.reduce((sum, row) => sum + getDocumentSize(row), 0) };
  },
});
