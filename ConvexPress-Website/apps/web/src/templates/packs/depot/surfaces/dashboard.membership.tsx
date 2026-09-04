/**
 * Depot · dashboard.membership — the member's active plan(s) and grace
 * grants as dense boxes (status badge, renewal / grace dates, featured
 * benefits, "Manage billing"), then the upgrade paths as a card grid. Same
 * hrefs and empty state as Core.
 */
import { Link } from "@tanstack/react-router";
import { Calendar, Settings2, Sparkles } from "lucide-react";

import type { DashboardMembershipGrant, DashboardMembershipPublicPlan, DashboardMembershipSurfaceData } from "@/templates/packs/core/surfaces/dashboard.membership";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Card, EmptyState, Skeleton, buttonClasses } from "../parts";
import { DashboardPageHeader, DashboardSection, StatusBadge, dateOrDash } from "../parts/extra-dashboard";

export default function DepotDashboardMembership({ data }: SurfaceProps<DashboardMembershipSurfaceData>) {
  const { isLoading, activeGrants, hasActive, upgradeablePlans, hrefs } = data;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-hidden="true">
        <div className="flex flex-col gap-2 border-b border-border pb-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div data-slot="dashboard-membership" data-pack="depot" className="flex flex-col gap-4">
      <DashboardPageHeader eyebrow="Membership" title="My membership" description="Your active plan, benefits, and available upgrades." />

      {hasActive ? (
        <DashboardSection title="Current plan" count={activeGrants.length > 1 ? activeGrants.length : undefined}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeGrants.map((grant) => (
              <GrantCard key={grant._id} grant={grant} subscriptionsHref={hrefs.subscriptions} />
            ))}
          </div>
        </DashboardSection>
      ) : (
        <EmptyState
          title="You don't have a membership"
          description="Unlock exclusive content by joining a plan."
          action={
            <Link to={hrefs.pricing} className={buttonClasses("primary")}>
              View plans
            </Link>
          }
        />
      )}

      {upgradeablePlans.length > 0 ? (
        <DashboardSection title={hasActive ? "Upgrade your plan" : "Available plans"} count={upgradeablePlans.length}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upgradeablePlans.map((plan) => (
              <UpgradePlanCard key={plan._id} plan={plan} href={hrefs.upgrade(plan.slug)} />
            ))}
          </div>
        </DashboardSection>
      ) : null}
    </div>
  );
}

function GrantCard({ grant, subscriptionsHref }: { grant: DashboardMembershipGrant; subscriptionsHref: string }) {
  const statusLabel = grant.status === "grace" ? "Grace period" : undefined;
  const renewalDate = grant.endsAt ? dateOrDash(grant.endsAt) : null;
  const graceDate = grant.graceEndsAt ? dateOrDash(grant.graceEndsAt) : null;
  const featured = (grant.benefits ?? []).filter((benefit) => benefit.displayAsFeature);
  const benefits = featured.length > 0 ? featured : (grant.benefits ?? []);

  return (
    <Card data-slot="membership-grant-card" className="flex flex-col gap-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{grant.plan?.title ?? "Membership"}</h3>
          {grant.plan?.description ? <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">{grant.plan.description}</p> : null}
        </div>
        <StatusBadge status={grant.status} label={statusLabel} />
      </div>

      {renewalDate || (graceDate && grant.status === "grace") ? (
        <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums text-muted-foreground">
          {renewalDate ? (
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5" aria-hidden="true" />
              Renews {renewalDate}
            </span>
          ) : null}
          {graceDate && grant.status === "grace" ? (
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5" aria-hidden="true" />
              Grace ends {graceDate}
            </span>
          ) : null}
        </div>
      ) : null}

      {benefits.length > 0 ? (
        <ul className="flex flex-col gap-1 text-[13px] text-foreground">
          {benefits.slice(0, 5).map((benefit) => (
            <li key={benefit._id} className="flex items-start gap-2">
              <Sparkles className="mt-1 size-3 shrink-0 text-primary" aria-hidden="true" />
              <span>{benefit.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {grant.sourceType === "subscription" ? (
        <a href={subscriptionsHref} className={buttonClasses("secondary", "sm", "mt-auto self-start")}>
          <Settings2 className="size-3.5" aria-hidden="true" />
          Manage billing
        </a>
      ) : null}
    </Card>
  );
}

function UpgradePlanCard({ plan, href }: { plan: DashboardMembershipPublicPlan; href: string }) {
  const featured = plan.benefits.filter((benefit) => benefit.displayAsFeature);
  const benefits = featured.length > 0 ? featured : plan.benefits;

  return (
    <Card data-slot="membership-upgrade-plan-card" className="flex flex-col gap-3 p-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{plan.title}</h3>
        {plan.description ? <p className="line-clamp-3 text-[13px] leading-5 text-muted-foreground">{plan.description}</p> : null}
      </div>

      {benefits.length > 0 ? (
        <ul className="flex flex-col gap-1 text-[13px] text-foreground">
          {benefits.slice(0, 3).map((benefit) => (
            <li key={benefit._id} className="flex items-start gap-2">
              <Sparkles className="mt-1 size-3 shrink-0 text-primary" aria-hidden="true" />
              <span>{benefit.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <a href={href} className={buttonClasses("primary", "sm", "mt-auto w-full")}>
        Upgrade to {plan.title}
      </a>
    </Card>
  );
}
