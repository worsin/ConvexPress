import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { ConvexError } from "convex/values";

import {
  action,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireAuth } from "../helpers/auth";
import type { AccessDecisionInput } from "./decision";
import { resolveStoredAccess } from "./runtime";

export const OPERATOR_ERROR_CODE = "CONTROL_PLANE_OPERATION_FAILED" as const;

/**
 * Convex hides the message of a plain `Error` from clients ("Server Error"),
 * so every domain check in the control plane ("Deployment origin is already
 * attached to another environment", "Website is not active", …) would reach
 * the operator as a generic failure. Domain errors are re-thrown as
 * `ConvexError` so the admin can show the actual reason. Messages here are
 * operator-facing validation text; secrets never travel in error messages.
 */
export function toOperatorError(error: unknown): unknown {
  if (error instanceof ConvexError) return error;
  if (error instanceof Error && error.message && error.message.length <= 400) {
    return new ConvexError({ code: OPERATOR_ERROR_CODE, message: error.message });
  }
  return error;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function surfaceOperatorErrors<B extends (fn: any) => any>(builder: B): B {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((fn: any) => {
    const definition = typeof fn === "function" ? { handler: fn } : fn;
    const handler = definition.handler;
    return builder({
      ...definition,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler: async (ctx: any, args: any) => {
        try {
          return await handler(ctx, args);
        } catch (error) {
          throw toOperatorError(error);
        }
      },
    });
  }) as B;
}

export const authenticatedQuery = surfaceOperatorErrors(
  customQuery(
    query,
    customCtx(async (ctx: QueryCtx) => ({ operator: await requireAuth(ctx) })),
  ),
);

export const authenticatedMutation = surfaceOperatorErrors(
  customMutation(
    mutation,
    customCtx(async (ctx: MutationCtx) => ({ operator: await requireAuth(ctx) })),
  ),
);

/** Public operator-facing action whose domain errors reach the client. */
export const operatorAction = surfaceOperatorErrors(action);

export function publicAccessDeniedData() {
  return {
    code: "CONTROL_PLANE_ACCESS_DENIED",
    message: "This operator is not authorized for the requested control-plane operation",
  } as const;
}

function denied() {
  return new ConvexError(publicAccessDeniedData());
}

export async function assertStoredAccess(
  ctx: QueryCtx | MutationCtx,
  operator: Awaited<ReturnType<typeof requireAuth>>,
  request: AccessDecisionInput["request"],
) {
  const decision = await resolveStoredAccess(ctx, operator, request);
  if (!decision.allowed) throw denied();
  return decision;
}

export function authorizedQuery(request: AccessDecisionInput["request"]) {
  return surfaceOperatorErrors(
    customQuery(
      query,
      customCtx(async (ctx: QueryCtx) => {
        const operator = await requireAuth(ctx);
        const accessDecision = await assertStoredAccess(ctx, operator, request);
        return { operator, accessDecision };
      }),
    ),
  );
}

export function authorizedMutation(request: AccessDecisionInput["request"]) {
  return surfaceOperatorErrors(
    customMutation(
      mutation,
      customCtx(async (ctx: MutationCtx) => {
        const operator = await requireAuth(ctx);
        const accessDecision = await assertStoredAccess(ctx, operator, request);
        return { operator, accessDecision };
      }),
    ),
  );
}
