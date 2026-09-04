/**
 * Subscription: the current plan, status, and next renewal
 * (commerceSubscriptions.portal.getMyActiveContracts).
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { useSettings } from "@/contexts/SettingsContext";
import type { DashboardWidgetModule, DashboardWidgetProps } from "../../contracts";
import { WidgetEmpty, WidgetSkeleton } from "../../grid/WidgetCard";
import { useDashboardShell } from "../../shell/DashboardShellContext";
import { Pill, ViewAllLink, formatMoney, formatShortDate, statusTone } from "../_shared";

interface Contract {
  _id: string;
  status: string;
  currencyCode?: string;
  recurringAmount?: number;
  nextBillingAt?: number;
  nextChargeAt?: number;
  currentPeriodEndAt?: number;
  trialEndsAt?: number;
  offer?: { title: string; recurringAmount?: number; currencyCode?: string } | null;
  product?: { title?: string } | null;
}

function SubscriptionWidget({ size }: DashboardWidgetProps) {
  const { to } = useDashboardShell();
  const settings = useSettings();
  const enabled = settings?.plugins?.commerceSubscriptionsEnabled === true;
  const contracts = useQuery(api.commerceSubscriptions.portal.getMyActiveContracts, enabled ? {} : "skip") as
    | Contract[]
    | undefined;
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
  const amount = current.recurringAmount ?? current.offer?.recurringAmount;
  const currency = current.currencyCode ?? current.offer?.currencyCode;
  const renews = current.nextBillingAt ?? current.nextChargeAt ?? current.currentPeriodEndAt;
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div>
        <p className="truncate text-sm font-semibold text-foreground">{current.offer?.title ?? current.product?.title ?? "Subscription"}</p>
        <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Pill tone={statusTone(current.status)}>{current.status}</Pill>
          {amount !== undefined && <span>{formatMoney(amount, currency)} / cycle</span>}
        </p>
      </div>
      {size !== "sm" && (
        <dl className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <dt className="text-muted-foreground">{current.status === "trialing" ? "Trial ends" : "Renews"}</dt>
            <dd className="text-foreground">{formatShortDate(current.status === "trialing" ? current.trialEndsAt : renews)}</dd>
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
