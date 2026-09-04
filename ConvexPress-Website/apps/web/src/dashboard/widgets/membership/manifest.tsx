/**
 * Membership: plan, status, and benefits at a glance (membership.queries.getMyMembership).
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { useSettings } from "@/contexts/SettingsContext";
import type { DashboardWidgetModule, DashboardWidgetProps } from "../../contracts";
import { WidgetEmpty, WidgetSkeleton } from "../../grid/WidgetCard";
import { useDashboardShell } from "../../shell/DashboardShellContext";
import { Pill, ViewAllLink, formatShortDate, statusTone } from "../_shared";

interface Grant {
  _id: string;
  status: string;
  endsAt?: number;
  graceEndsAt?: number;
  plan: { title: string } | null;
  benefits: Array<{ _id: string; label: string }>;
}

function MembershipWidget({ size }: DashboardWidgetProps) {
  const { to } = useDashboardShell();
  const settings = useSettings();
  const enabled = settings?.plugins?.membershipEnabled === true;
  const data = useQuery(api.membership.queries.getMyMembership, enabled ? {} : "skip") as
    | { primaryGrant: Grant | null }
    | null
    | undefined;
  if (!enabled) return <WidgetEmpty icon="badge-check" title="Memberships are off" />;
  if (data === undefined) return <WidgetSkeleton rows={3} />;
  const grant = data?.primaryGrant;
  if (!grant) {
    return (
      <WidgetEmpty
        icon="badge-check"
        title="No membership"
        action={
          <Link to="/pricing" className="font-medium text-primary hover:underline">
            See plans
          </Link>
        }
      />
    );
  }
  const ends = grant.status === "grace" ? grant.graceEndsAt : grant.endsAt;
  return (
    <div className="flex h-full flex-col gap-2">
      <div>
        <p className="truncate text-sm font-semibold text-foreground">{grant.plan?.title ?? "Member"}</p>
        <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Pill tone={statusTone(grant.status)}>{grant.status}</Pill>
          <span>{ends ? `Until ${formatShortDate(ends)}` : "No end date"}</span>
        </p>
      </div>
      {size !== "sm" && grant.benefits.length > 0 && (
        <ul role="list" className="space-y-1 text-[11px] text-foreground">
          {grant.benefits.slice(0, 3).map((benefit) => (
            <li key={benefit._id} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-1 rounded-full bg-primary" />
              <span className="truncate">{benefit.label}</span>
            </li>
          ))}
        </ul>
      )}
      <Link to={to("/membership")} className="mt-auto text-[11px] font-medium text-primary hover:underline">
        Manage membership
      </Link>
    </div>
  );
}

function Actions() {
  const { to } = useDashboardShell();
  return <ViewAllLink to={to("/membership")} />;
}

const module: DashboardWidgetModule = {
  id: "membership",
  Widget: MembershipWidget,
  Actions,
};

export default module;
