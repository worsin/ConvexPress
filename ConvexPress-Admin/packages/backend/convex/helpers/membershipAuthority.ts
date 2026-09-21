/** Narrow, transaction-local reads shared by role/capability resolution. */
import type { RequestReadLedger, MeasuredPolicyPage } from "./requestReadLedger";
import { makeFunctionReference } from "convex/server";
import { ConvexError, getDocumentSize, type Value } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { GrantArgs, GrantResult } from "../membership/policyReads";

const grantRead = makeFunctionReference<"query", GrantArgs, GrantResult[]>("membership/policyReads:grants");
export async function readMembershipAuthorityGrants(ctx: Pick<QueryCtx, "runQuery">, userId: Id<"users">, budget?: RequestReadLedger): Promise<GrantResult[]> {
  // Each registered internal query owns a complete indexed pagination journal.
  // Separate reads preserve nested callers and pending mutation writes. Failure
  // is not permission to skip this policy and use a potentially different role.
  const active = await readAuthorityGrantStatus(ctx, { userId, status: "active" }, budget);
  const grace = await readAuthorityGrantStatus(ctx, { userId, status: "grace" }, budget);
  if (!Array.isArray(active) || !Array.isArray(grace)) throw new ConvexError({ code: "MEMBERSHIP_POLICY_BUDGET", message: "Membership authority could not be determined." });
  const now = Date.now();
  // Record transitions before filtering: a future grant can turn a denied view
  // into an allowed one without any database write at its start time.
  for (const grant of [...active, ...grace]) {
    if (grant.revokedAt !== undefined) continue;
    budget?.noteAuthorizationBoundary(grant.startsAt, now);
    budget?.noteAuthorizationBoundary(grant.status === "active" ? grant.endsAt : undefined, now);
    budget?.noteAuthorizationBoundary(grant.graceEndsAt, now);
  }
  return [...active, ...grace].filter(grant => membershipGrantIsCurrent(grant, now));
}

/** Authorization never waits for the expiry scheduler to update a stored status. */
export function membershipGrantIsCurrent(grant: GrantResult, now: number): boolean {
  if (!Number.isFinite(grant.startsAt) || grant.startsAt > now || grant.revokedAt !== undefined) return false;
  if (grant.status === "grace") return grant.graceEndsAt !== undefined && Number.isFinite(grant.graceEndsAt) && now < grant.graceEndsAt;
  if (grant.status !== "active") return false;
  if (grant.endsAt === undefined) return true;
  if (!Number.isFinite(grant.endsAt)) return false;
  // An explicitly recorded grace window is authoritative at the deadline;
  // delayed status maintenance cannot insert a gap or extend that window.
  return now < grant.endsAt || (grant.graceEndsAt !== undefined && Number.isFinite(grant.graceEndsAt) && now < grant.graceEndsAt);
}

const measuredGrantRead = makeFunctionReference<"query", GrantArgs, MeasuredPolicyPage<GrantResult>>("membership/policyReads:measuredGrants");
export async function readAuthorityGrantStatus(ctx: Pick<QueryCtx, "runQuery">, args: GrantArgs, budget?: RequestReadLedger): Promise<GrantResult[]> {
  if (!budget) return ctx.runQuery(grantRead, args);
  budget.beforeRead();
  const result = await ctx.runQuery(measuredGrantRead, args);
  budget.recordPage(result);
  return result.items;
}

export const MEMBERSHIP_AUTHORITY_LIMITS: Readonly<{ documents: number; bytes: number; documentBytes: number }> = Object.freeze<{ documents: number; bytes: number; documentBytes: number }>({ documents: 128, bytes: 1024 * 1024, documentBytes: 128 * 1024 });
function budgetFailure(): never { throw new ConvexError({ code: "MEMBERSHIP_POLICY_BUDGET", message: "Membership authority exceeds its safe read budget." }); }
/** A fresh reader per resolution. Never cache across helper calls: a mutation
 * may add/remove a grant, plan or role between two permission checks. */
export function membershipAuthorityReader(ctx: Pick<QueryCtx, "db">, budget?: RequestReadLedger) {
  let documents = 0, bytes = 0;
  const plans = new Map<string, Doc<"membership_plans"> | null>();
  const roles = new Map<string, Doc<"roles"> | null>();
  const before = () => { budget?.beforeRead(); if (documents >= MEMBERSHIP_AUTHORITY_LIMITS.documents || bytes >= MEMBERSHIP_AUTHORITY_LIMITS.bytes) budgetFailure(); documents++; };
  const record = (doc: Record<string, Value> | null) => {
    budget?.record(doc);
    if (!doc) return;
    const size = getDocumentSize(doc); bytes += size;
    if (size > MEMBERSHIP_AUTHORITY_LIMITS.documentBytes || bytes > MEMBERSHIP_AUTHORITY_LIMITS.bytes) budgetFailure();
  };
  return {
    async plan(id: Id<"membership_plans">): Promise<Doc<"membership_plans"> | null> {
      if (plans.has(id)) return plans.get(id)!;
      before(); const doc = await ctx.db.get("membership_plans", id); record(doc); plans.set(id, doc); return doc;
    },
    async role(id: Id<"roles">): Promise<Doc<"roles"> | null> {
      if (roles.has(id)) return roles.get(id)!;
      before(); const doc = await ctx.db.get("roles", id); record(doc); roles.set(id, doc); return doc;
    },
    async roleBySlug(slug: string): Promise<Doc<"roles"> | null> {
      before(); const doc = await ctx.db.query("roles").withIndex("by_slug", q => q.eq("slug", slug)).unique();
      record(doc); if (doc) roles.set(doc._id, doc); return doc;
    },
  };
}
