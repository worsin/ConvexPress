import { ConvexError } from "convex/values";

import type { Doc } from "../_generated/dataModel";
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

type OfferAvailability = Pick<
  Doc<"commerce_subscription_offers">,
  "status" | "availableInDirectForms" | "availableInCart"
>;

/**
 * Whether a customer may start a direct signup (signup page or form action)
 * for this offer. Draft offers are unpublished, and an offer the admin did not
 * mark "available in direct-to-signup forms" (for example an admin-provisioned
 * comp plan) must never be self-served by a client that knows its id.
 */
export function isOfferOpenForDirectSignup(offer: OfferAvailability): boolean {
  return offer.status === "active" && offer.availableInDirectForms;
}

/**
 * Whether a customer may move an existing contract onto this offer. Only a
 * published offer sold through a customer channel qualifies; admin-only offers
 * are provisioned by staff through `mutations.create`.
 */
export function isOfferOpenToCustomers(offer: OfferAvailability): boolean {
  return (
    offer.status === "active" &&
    (offer.availableInDirectForms || offer.availableInCart)
  );
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
