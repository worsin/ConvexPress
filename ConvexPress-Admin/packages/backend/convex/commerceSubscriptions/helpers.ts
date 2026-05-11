import { ConvexError } from "convex/values";

import type { QueryCtx, MutationCtx } from "../_generated/server";
import {
  isCommerceSubscriptionsEnabled,
  requireCommerceEnabled,
} from "../commerce/helpers";

type SubscriptionCtx = QueryCtx | MutationCtx;

export interface CommerceSubscriptionEntitlement {
  subjectUserId: string;
  sourcePlugin: "commerceSubscriptions";
  sourceType: "subscription";
  sourceRef: string;
  entitlementCode: string;
  status: "active" | "grace" | "revoked" | "expired";
  startsAt: number;
  endsAt?: number;
  graceEndsAt?: number;
  metadata?: Record<string, unknown>;
}

export async function requireCommerceSubscriptionsEnabled(
  ctx: SubscriptionCtx,
): Promise<void> {
  await requireCommerceEnabled(ctx);

  if (!(await isCommerceSubscriptionsEnabled(ctx))) {
    throw new ConvexError({
      code: "commerce_subscriptions_disabled",
      message: "Commerce Subscriptions plugin is disabled.",
    });
  }
}
