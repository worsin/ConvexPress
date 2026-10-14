/**
 * Subscription: the current plan, status, and the next charge (amount with
 * discounts, and date)
 * (commerceSubscriptions.portal.getMyActiveContracts).
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { useSettings } from "@/contexts/SettingsContext";
import type { DashboardWidgetModule, DashboardWidgetProps } from "../../contracts";
import { WidgetEmpty, WidgetSkeleton } from "../../grid/WidgetCard";
import { useDashboardShell } from "../../shell/DashboardShellContext";
import { formatMoney, type CustomerContract } from "@/components/subscriptions/portalTypes";
import { Pill, ViewAllLink, formatShortDate, statusTone } from "../_shared";

const STATUS_LABELS: Record<CustomerContract["status"], string> = {
  draft: "Draft",
  trialing: "Trial",
  active: "Active",
  past_due: "Past due",
  paused: "Paused",
  pending_cancel: "Ending",
  cancelled: "Cancelled",
  expired: "Ended",
};

function SubscriptionWidget({ size }: DashboardWidgetProps) {
  const { to } = useDashboardShell();
  const settings = useSettings();
  const enabled = settings?.plugins?.commerceSubscriptionsEnabled === true;
  const contracts = useQuery(api.commerceSubscriptions.portal.getMyActiveContracts, enabled ? {} : "skip");
  if (!enabled) return <WidgetEmpty icon="repeat" title="Subscriptions are off" />;
  if (contracts === undefined) return <WidgetSkeleton rows={3} />;
  const current = contracts.find((c) => c.status === "active" || c.status === "trialing") ?? contracts[0];
  if (!current) {
    return (
      <WidgetEmpty
        icon="repeat"
        title="No subscription"
        action={
          <Link to="/pricing" className="font-medium text-primary hover:underline">
            See plans
          </Link>
        }
      />
    );
  }
  const charging = current.status === "active" || current.status === "trialing";
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div>
        <p className="truncate text-sm font-semibold text-foreground">{current.offer?.title ?? current.product?.title ?? "Subscription"}</p>
        <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Pill tone={statusTone(current.status)}>{STATUS_LABELS[current.status]}</Pill>
          {charging && current.nextChargeAt ? (
            <span>
              {formatMoney(current.nextChargeAmount, current.currencyCode)} on {formatShortDate(current.nextChargeAt)}
            </span>
          ) : null}
        </p>
      </div>
      {size !== "sm" && (
        <dl className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <dt className="text-muted-foreground">
              {current.status === "trialing" ? "Trial ends" : current.status === "pending_cancel" ? "Access until" : "Renews"}
            </dt>
            <dd className="text-foreground">
              {formatShortDate(current.status === "trialing" ? current.trialEndsAt : (current.nextChargeAt ?? current.currentPeriodEndAt))}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Subscriptions</dt>
            <dd className="text-foreground">{contracts.length}</dd>
          </div>
        </dl>
      )}
      <Link to={to(`/subscriptions/${current._id}`)} className="text-[11px] font-medium text-primary hover:underline">
        Manage subscription
      </Link>
    </div>
  );
}

function Actions() {
  const { to } = useDashboardShell();
  return <ViewAllLink to={to("/subscriptions")} />;
}

const module: DashboardWidgetModule = {
  id: "subscription",
  Widget: SubscriptionWidget,
  Actions,
};

export default module;
