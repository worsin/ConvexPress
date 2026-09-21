import type { RequestReadLedger } from "../helpers/requestReadLedger";
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { contentMembershipPaths } from "../helpers/contentMembershipPaths";
import { loadMatchingRules } from "./access";
import type { RuleResult } from "./policyReads";

export type CopiedContentPolicy = Omit<
  RuleResult,
  "resourceType" | "resourceIdOrKey"
>;

/** Snapshot direct and URL policies before any duplicate writes.
 * Source query functions enforce complete indexed pages. The caller supplies
 * its remaining aggregate row/byte allowance; these results consume that budget.
 * No actor entitlements are evaluated and no global route policy is modified.
 */
export async function prepareContentRestrictionCopy(
  ctx: MutationCtx,
  source: Doc<"posts">,
  budget: { maxRows: number; maxBytes: number },
  ledger?: RequestReadLedger,
): Promise<{ policies: CopiedContentPolicy[]; bytes: number }> {
  const policies: CopiedContentPolicy[] = [];
  let bytes = 0;
  const usedGroups = new Set<string>();
  function append(rule: RuleResult, policyGroup = rule.policyGroup) {
    const { resourceType, resourceIdOrKey, ...policy } = rule;
    const copied = {
      ...policy,
      ...(policyGroup === undefined ? {} : { policyGroup }),
    };
    bytes += new TextEncoder().encode(JSON.stringify(copied)).byteLength;
    if (
      policies.length >= Math.min(256, budget.maxRows) ||
      bytes > Math.min(512 * 1024, budget.maxBytes)
    ) {
      throw new ConvexError({
        code: "LIMIT_EXCEEDED",
        message: "This content exceeds the atomic duplication policy budget.",
      });
    }
    if (policyGroup !== undefined) usedGroups.add(policyGroup);
    policies.push(copied);
  }
  const direct = await loadMatchingRules(ctx, source.type, String(source._id), ledger);
  for (const rule of direct) append(rule);
  let nextGroup = 0;
  for (const path of await contentMembershipPaths(ctx, source, undefined, ledger)) {
    const rules = await loadMatchingRules(ctx, "route", path, ledger);
    const groupMap = new Map<string | undefined, string>();
    for (const rule of rules) {
      let group = groupMap.get(rule.policyGroup);
      if (group === undefined) {
        do {
          group = `copied-route-${++nextGroup}`;
        } while (usedGroups.has(group));
        groupMap.set(rule.policyGroup, group);
      }
      append(rule, group);
    }
  }
  return { policies, bytes };
}
