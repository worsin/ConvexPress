import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { ConvexError } from "convex/values";

import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireAuth } from "../helpers/auth";
import type { AccessDecisionInput } from "./decision";
import { resolveStoredAccess } from "./runtime";

export const authenticatedQuery = customQuery(
  query,
  customCtx(async (ctx: QueryCtx) => ({ operator: await requireAuth(ctx) })),
);

export const authenticatedMutation = customMutation(
  mutation,
  customCtx(async (ctx: MutationCtx) => ({ operator: await requireAuth(ctx) })),
);

function denied(decision: Awaited<ReturnType<typeof resolveStoredAccess>>) {
  return new ConvexError({
    code: "CONTROL_PLANE_ACCESS_DENIED",
    message: "This operator is not authorized for the requested control-plane operation",
    reason: decision.reason,
    winningRuleId: decision.winningRuleId,
  });
}

export async function assertStoredAccess(
  ctx: QueryCtx | MutationCtx,
  operator: Awaited<ReturnType<typeof requireAuth>>,
  request: AccessDecisionInput["request"],
) {
  const decision = await resolveStoredAccess(ctx, operator, request);
  if (!decision.allowed) throw denied(decision);
  return decision;
}

export function authorizedQuery(request: AccessDecisionInput["request"]) {
  return customQuery(
    query,
    customCtx(async (ctx: QueryCtx) => {
      const operator = await requireAuth(ctx);
      const accessDecision = await assertStoredAccess(ctx, operator, request);
      return { operator, accessDecision };
    }),
  );
}

export function authorizedMutation(request: AccessDecisionInput["request"]) {
  return customMutation(
    mutation,
    customCtx(async (ctx: MutationCtx) => {
      const operator = await requireAuth(ctx);
      const accessDecision = await assertStoredAccess(ctx, operator, request);
      return { operator, accessDecision };
    }),
  );
}
