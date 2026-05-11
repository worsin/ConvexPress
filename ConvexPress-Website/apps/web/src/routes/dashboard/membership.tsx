/**
 * Dashboard — Membership
 *
 * Authenticated member-facing page that shows the signed-in user's active
 * membership plan(s), grace-period grants, and any upgrade paths to plans
 * with higher priority. Mirrors the dashboard conventions used by the
 * Subscriptions route (full-page layout, no modals, Base UI + theme
 * tokens, PublicPluginGate wrapper so the route still 404s cleanly when
 * the plugin is disabled site-wide).
 */
import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Calendar, Crown, Settings2, Sparkles } from "lucide-react";

import { api } from "@convexpress-website/backend/generated/api";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/membership")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex" },
      { title: "My Membership - ConvexPress" },
    ],
  }),
  loader: async ({ context: { queryClient } }) => {
    // Prefetch both queries so SSR renders a fully-populated dashboard
    // instead of a flash of skeletons.
    await Promise.all([
      queryClient.ensureQueryData(
        convexQuery(api.membership.queries.getMyMembership, {}),
      ),
      queryClient.ensureQueryData(
        convexQuery(api.membership.queries.listPublicPlans, {}),
      ),
    ]);
  },
  component: DashboardMembershipPage,
});

function DashboardMembershipPage() {
  return (
    <PublicPluginGate pluginId="membership">
      <MembershipContent />
    </PublicPluginGate>
  );
}

// ─── Types (mirror the shape returned by getMyMembership/listPublicPlans) ──

interface MembershipBenefit {
  _id: string;
  code: string;
  label: string;
  description?: string | null;
  displayAsFeature?: boolean;
}

interface MembershipPlanSummary {
  _id: string;
  title: string;
  slug: string;
  description?: string | null;
  priority: number;
}

interface MembershipGrant {
  _id: string;
  planId: string;
  status: "active" | "grace" | "expired" | "revoked" | "pending" | string;
  sourceType: "manual" | "subscription" | "purchase" | "import" | string;
  startsAt: number;
  endsAt?: number;
  graceEndsAt?: number;
  plan: MembershipPlanSummary | null;
  benefits: MembershipBenefit[];
}

interface MyMembershipResponse {
  primaryGrant: MembershipGrant | null;
  allGrants: MembershipGrant[];
}

interface PublicPlan {
  _id: string;
  title: string;
  slug: string;
  description?: string | null;
  priority: number;
  benefits: MembershipBenefit[];
}

// ─── Loading / Content ─────────────────────────────────────────────────────

function MembershipContent() {
  const myMembership = useQuery(api.membership.queries.getMyMembership, {}) as
    | MyMembershipResponse
    | null
    | undefined;
  const plans = useQuery(api.membership.queries.listPublicPlans, {}) as
    | PublicPlan[]
    | null
    | undefined;

  // Loading: either query still hydrating
  if (myMembership === undefined || plans === undefined) {
    return <MembershipSkeleton />;
  }

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

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-sm font-medium text-foreground">My Membership</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your active plan, benefits, and available upgrades.
        </p>
      </header>

      {hasActive ? (
        <section aria-label="Active plans" className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Current plan
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {activeGrants.map((grant) => (
              <GrantCard key={grant._id} grant={grant} />
            ))}
          </div>
        </section>
      ) : (
        <DashboardCard title="No membership yet">
          <EmptyState
            icon={Crown}
            title="You don't have a membership"
            description="Unlock exclusive content by joining a plan."
            action={{ label: "View plans", href: "/pricing" }}
          />
        </DashboardCard>
      )}

      <UpgradeSection
        upgradeablePlans={upgradeablePlans}
        hasActive={hasActive}
      />
    </div>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────

function MembershipSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

// ─── Grant Card ────────────────────────────────────────────────────────────

function formatDate(ts: number | undefined) {
  if (!ts) return undefined;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function GrantCard({ grant }: { grant: MembershipGrant }) {
  const statusLabel = grant.status === "grace" ? "Grace Period" : grant.status;
  const renewalDate = formatDate(grant.endsAt);
  const graceDate = formatDate(grant.graceEndsAt);
  const featuredBenefits = (grant.benefits ?? []).filter(
    (b) => b.displayAsFeature,
  );
  const benefitList =
    featuredBenefits.length > 0 ? featuredBenefits : grant.benefits ?? [];

  return (
    <div
      data-slot="membership-grant-card"
      className="flex flex-col gap-4 border border-border bg-card p-4 text-card-foreground"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {grant.plan?.title ?? "Membership"}
          </h3>
          {grant.plan?.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {grant.plan.description}
            </p>
          )}
        </div>
        <StatusBadge status={statusLabel} />
      </div>

      {(renewalDate || graceDate) && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          {renewalDate && (
            <div className="flex items-center gap-1.5">
              <Calendar className="size-3.5" aria-hidden="true" />
              <span>Renews {renewalDate}</span>
            </div>
          )}
          {graceDate && grant.status === "grace" && (
            <div className="flex items-center gap-1.5">
              <Calendar className="size-3.5" aria-hidden="true" />
              <span>Grace ends {graceDate}</span>
            </div>
          )}
        </div>
      )}

      {benefitList.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-foreground">
          {benefitList.slice(0, 5).map((benefit) => (
            <li key={benefit._id} className="flex items-start gap-2">
              <Sparkles
                className="mt-0.5 size-3 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span>{benefit.label}</span>
            </li>
          ))}
        </ul>
      )}

      {grant.sourceType === "subscription" && (
        <a
          href="/dashboard/subscriptions"
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-none border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted",
          )}
        >
          <Settings2 className="size-3.5" aria-hidden="true" />
          Manage billing
        </a>
      )}
    </div>
  );
}

// ─── Upgrade Section ───────────────────────────────────────────────────────

function UpgradeSection({
  upgradeablePlans,
  hasActive,
}: {
  upgradeablePlans: PublicPlan[];
  hasActive: boolean;
}) {
  if (upgradeablePlans.length === 0) return null;

  return (
    <section aria-label="Upgrade plans" className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {hasActive ? "Upgrade your plan" : "Available plans"}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {upgradeablePlans.map((plan) => (
          <UpgradePlanCard key={plan._id} plan={plan} />
        ))}
      </div>
    </section>
  );
}

function UpgradePlanCard({ plan }: { plan: PublicPlan }) {
  const featured = plan.benefits.filter((b) => b.displayAsFeature);
  const benefitList = featured.length > 0 ? featured : plan.benefits;
  const href = `/pricing?plan=${encodeURIComponent(plan.slug)}`;

  return (
    <div
      data-slot="membership-upgrade-plan-card"
      className="flex flex-col gap-3 border border-border bg-card p-4 text-card-foreground"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">{plan.title}</h3>
        {plan.description && (
          <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">
            {plan.description}
          </p>
        )}
      </div>

      {benefitList.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-foreground">
          {benefitList.slice(0, 3).map((benefit) => (
            <li key={benefit._id} className="flex items-start gap-2">
              <Sparkles
                className="mt-0.5 size-3 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span>{benefit.label}</span>
            </li>
          ))}
        </ul>
      )}

      <a
        href={href}
        className={cn(
          "mt-auto inline-flex items-center justify-center gap-1.5 rounded-none bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90",
        )}
      >
        Upgrade to {plan.title}
      </a>
    </div>
  );
}
