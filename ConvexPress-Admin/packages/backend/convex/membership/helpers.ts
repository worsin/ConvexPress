import { ConvexError } from "convex/values";

import type { QueryCtx, MutationCtx } from "../_generated/server";
import { isMembershipPluginEnabled } from "../commerce/helpers";

type MembershipCtx = QueryCtx | MutationCtx;

export interface MembershipAccessDecision {
  allowed: boolean;
  reason: string;
  matchingPlanIds: string[];
}

export async function requireMembershipEnabled(
  ctx: MembershipCtx,
): Promise<void> {
  if (!(await isMembershipPluginEnabled(ctx))) {
    throw new ConvexError({
      code: "membership_disabled",
      message: "Membership plugin is disabled.",
    });
  }
}
