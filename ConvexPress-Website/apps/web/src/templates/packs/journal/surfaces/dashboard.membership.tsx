/**
 * Journal · dashboard.membership — the member's active plan(s), grace-period
 * grants, and upgrade paths as rule-separated rows: the plan in display type,
 * a status pill, small-caps renewal dates, a quiet benefit list and the pill
 * action Core offers (Manage billing / Upgrade / View plans).
 */
import type { DashboardMembershipGrant, DashboardMembershipPublicPlan, DashboardMembershipSurfaceData } from "@/templates/packs/core/surfaces/dashboard.membership";
import type { SurfaceProps } from "@/templates/sdk/types";

import { EmptyState, LinkButton, SmallCaps, buttonClasses } from "../parts";
import { PageHeading, PageSkeleton, Row, RowList, Section, StatusPill, dashDate } from "../parts/extra-dashboard";

export default function JournalDashboardMembership({ data }: SurfaceProps<DashboardMembershipSurfaceData>) {
  const { isLoading, activeGrants, hasActive, upgradeablePlans, hrefs } = data;

  if (isLoading) return <PageSkeleton rows={2} />;

  return (
    <div data-slot="dashboard-membership" className="flex flex-col gap-10">
      <PageHeading eyebrow="Membership" title="My membership" lede="Your active plan, benefits, and available upgrades." />

      {hasActive ? (
        <Section title="Current plan" aria-label="Active plans">
          <RowList>
            {activeGrants.map((grant) => (
              <GrantRow key={grant._id} grant={grant} subscriptionsHref={hrefs.subscriptions} />
            ))}
          </RowList>
        </Section>
      ) : (
        <EmptyState
          eyebrow="No membership yet"
          title="Unlock exclusive content by joining a plan."
          action={
            <LinkButton to={hrefs.pricing} variant="primary">
              View plans
            </LinkButton>
          }
        />
      )}

      {upgradeablePlans.length > 0 ? (
        <Section title={hasActive ? "Upgrade your plan" : "Available plans"} aria-label="Upgrade plans">
          <RowList>
            {upgradeablePlans.map((plan) => (
              <PlanRow key={plan._id} plan={plan} href={hrefs.upgrade(plan.slug)} />
            ))}
          </RowList>
        </Section>
      ) : null}
    </div>
  );
}

function BenefitList({ benefits, limit }: { benefits: DashboardMembershipGrant["benefits"]; limit: number }) {
  const featured = (benefits ?? []).filter((benefit) => benefit.displayAsFeature);
  const list = (featured.length > 0 ? featured : benefits ?? []).slice(0, limit);
  if (list.length === 0) return null;
  return (
    <ul role="list" className="flex flex-col gap-1 text-sm leading-6 text-foreground">
      {list.map((benefit) => (
        <li key={benefit._id} className="flex items-baseline gap-3">
          <span className="text-primary" aria-hidden="true">
            —
          </span>
          <span>{benefit.label}</span>
        </li>
      ))}
    </ul>
  );
}

function GrantRow({ grant, subscriptionsHref }: { grant: DashboardMembershipGrant; subscriptionsHref: string }) {
  const statusLabel = grant.status === "grace" ? "Grace period" : grant.status;
  const renewalDate = grant.endsAt ? dashDate(grant.endsAt) : null;
  const graceDate = grant.graceEndsAt ? dashDate(grant.graceEndsAt) : null;

  return (
    <Row data-slot="membership-grant-row" className="gap-4 py-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="font-display text-xl leading-snug tracking-tight text-foreground">{grant.plan?.title ?? "Membership"}</h3>
          {grant.plan?.description ? <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{grant.plan.description}</p> : null}
        </div>
        <StatusPill status={grant.status} label={statusLabel} tone={grant.status === "grace" ? "muted" : undefined} />
      </div>

      {renewalDate || (graceDate && grant.status === "grace") ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {renewalDate ? <SmallCaps>Renews {renewalDate}</SmallCaps> : null}
          {renewalDate && graceDate && grant.status === "grace" ? (
            <span className="text-muted-foreground/60" aria-hidden="true">
              ·
            </span>
          ) : null}
          {graceDate && grant.status === "grace" ? <SmallCaps>Grace ends {graceDate}</SmallCaps> : null}
        </p>
      ) : null}

      <BenefitList benefits={grant.benefits} limit={5} />

      {grant.sourceType === "subscription" ? (
        <div>
          <a href={subscriptionsHref} className={buttonClasses("ghost", "h-10 px-5")}>
            Manage billing
          </a>
        </div>
      ) : null}
    </Row>
  );
}

function PlanRow({ plan, href }: { plan: DashboardMembershipPublicPlan; href: string }) {
  return (
    <Row data-slot="membership-upgrade-plan-row" className="gap-4 py-7 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-8">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <h3 className="font-display text-xl leading-snug tracking-tight text-foreground">{plan.title}</h3>
          {plan.description ? <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{plan.description}</p> : null}
        </div>
        <BenefitList benefits={plan.benefits} limit={3} />
      </div>
      <a href={href} className={buttonClasses("primary", "h-10 px-5")}>
        Upgrade to {plan.title}
      </a>
    </Row>
  );
}
