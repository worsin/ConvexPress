/**
 * Membership loader: membership gate (the route still 404s cleanly when the
 * plugin is disabled site-wide), getMyMembership + listPublicPlans, and the
 * upgrade computation, handed to the `dashboard.membership` surface.
 */
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import CoreDashboardMembership, {
  type DashboardMembershipGrant,
  type DashboardMembershipPublicPlan,
  type DashboardMembershipSurfaceData,
} from "@/templates/packs/core/surfaces/dashboard.membership";
import { Surface } from "@/templates/sdk/Surface";

interface MyMembershipResponse {
  primaryGrant: DashboardMembershipGrant | null;
  allGrants: DashboardMembershipGrant[];
}

export function DashboardMembershipPage() {
  return (
    <PublicPluginGate pluginId="membership">
      <MembershipContent />
    </PublicPluginGate>
  );
}

function MembershipContent() {
  const { to } = useDashboardPath();
  const myMembership = useQuery(api.membership.queries.getMyMembership, {}) as
    | MyMembershipResponse
    | null
    | undefined;
  const plans = useQuery(api.membership.queries.listPublicPlans, {}) as
    | DashboardMembershipPublicPlan[]
    | null
    | undefined;

  const isLoading = myMembership === undefined || plans === undefined;

  const activeGrants = myMembership?.allGrants ?? [];
  const hasActive = activeGrants.length > 0;
  const currentMaxPriority = hasActive
    ? Math.min(
        ...activeGrants
          .map((g) => g.plan?.priority ?? Infinity)
          .filter((p) => Number.isFinite(p)),
      )
    : Infinity;

  // Plans with strictly higher tier (lower priority number = higher tier,
  // matching how listPublicPlans is sorted by priority ascending).
  const upgradeablePlans = (plans ?? []).filter(
    (plan) => plan.priority < currentMaxPriority,
  );

  const data: DashboardMembershipSurfaceData = {
    isLoading,
    activeGrants,
    hasActive,
    upgradeablePlans,
    hrefs: {
      pricing: "/pricing",
      subscriptions: to("/subscriptions"),
      upgrade: (planSlug: string) => `/pricing?plan=${encodeURIComponent(planSlug)}`,
    },
  };

  return <Surface name="dashboard.membership" data={data} fallback={CoreDashboardMembership} />;
}
