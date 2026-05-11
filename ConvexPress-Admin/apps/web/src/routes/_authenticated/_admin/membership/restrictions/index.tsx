/**
 * Restrictions list — admin view.
 *
 * Resource-type tabs (all / post / page / product / route / block), plan
 * filter, and a table of rules. Clicking a row opens the full-page editor.
 * Creating a rule opens `/membership/restrictions/new`.
 */

import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import {
  Plus,
  Lock,
  ShieldCheck,
  ShieldOff,
  Box,
  FileText,
  FileCode,
  Link as LinkIcon,
  LogIn,
  EyeOff,
  Type,
  MessageSquare,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/membership/restrictions/",
)({
  component: MembershipRestrictionsPage,
});

type ResourceType = "page" | "post" | "route" | "product" | "block";
type RuleMode = "allow_only" | "deny_if_missing";
type TeaserMode = "hide" | "excerpt" | "custom_message";

type EnrichedRule = {
  _id: Id<"membership_restriction_rules">;
  resourceType: ResourceType;
  resourceIdOrKey: string;
  ruleMode: RuleMode;
  planIds: Id<"membership_plans">[];
  requiredCapabilities?: string[];
  teaserMode: TeaserMode;
  customMessage?: string;
  loginRequired: boolean;
  createdAt: number;
  updatedAt: number;
  plans: Array<{
    _id: Id<"membership_plans">;
    title: string;
    slug: string;
  }>;
};

type PlanSummary = {
  _id: Id<"membership_plans">;
  title: string;
  slug: string;
  status: "draft" | "active" | "archived";
};

const RESOURCE_TABS: Array<{
  id: "all" | ResourceType;
  label: string;
  icon?: React.ElementType;
}> = [
  { id: "all", label: "All" },
  { id: "post", label: "Posts", icon: FileText },
  { id: "page", label: "Pages", icon: FileText },
  { id: "product", label: "Products", icon: Box },
  { id: "route", label: "Routes", icon: LinkIcon },
  { id: "block", label: "Blocks", icon: FileCode },
];

function MembershipRestrictionsPage() {
  const navigate = useNavigate();

  const [resourceFilter, setResourceFilter] = useState<"all" | ResourceType>(
    "all",
  );
  const [planFilter, setPlanFilter] = useState<
    Id<"membership_plans"> | "all"
  >("all");

  const rulesResult = useQuery(
    (api as any).membership.queries.listRestrictions,
    resourceFilter === "all" ? {} : { resourceType: resourceFilter },
  ) as EnrichedRule[] | null | undefined;

  const plansResult = useQuery(
    (api as any).membership.queries.listPlans,
    {},
  ) as PlanSummary[] | null | undefined;

  const filteredRules = useMemo(() => {
    if (!rulesResult) return [];
    if (planFilter === "all") return rulesResult;
    return rulesResult.filter((r) =>
      r.planIds.some((pid) => pid === planFilter),
    );
  }, [rulesResult, planFilter]);

  // Plugin disabled
  if (rulesResult === null) {
    return <PluginDisabledNotice />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Restrictions</h1>
          <p className="text-sm text-muted-foreground">
            Rules that gate posts, pages, products, routes, and reusable
            blocks behind membership plans.
          </p>
        </div>
        <div>
          <Link
            to="/membership/restrictions/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New rule
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
          {RESOURCE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = resourceFilter === tab.id;
            const count =
              rulesResult?.filter((r) =>
                tab.id === "all" ? true : r.resourceType === tab.id,
              ).length ?? 0;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setResourceFilter(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {tab.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] font-semibold",
                    active
                      ? "bg-primary-foreground/15 text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <select
          value={planFilter === "all" ? "all" : String(planFilter)}
          onChange={(e) =>
            setPlanFilter(
              e.target.value === "all"
                ? "all"
                : (e.target.value as Id<"membership_plans">),
            )
          }
          className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <option value="all">All plans</option>
          {(plansResult ?? []).map((plan) => (
            <option key={plan._id} value={plan._id}>
              {plan.title}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {rulesResult === undefined ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : filteredRules.length === 0 ? (
          <EmptyState
            hasAnyRules={(rulesResult?.length ?? 0) > 0}
            onCreate={() =>
              navigate({ to: "/membership/restrictions/new" })
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Resource</th>
                <th className="px-4 py-3 text-left font-medium">Mode</th>
                <th className="px-4 py-3 text-left font-medium">Plans</th>
                <th className="px-4 py-3 text-left font-medium">Teaser</th>
                <th className="px-4 py-3 text-left font-medium">Auth</th>
                <th className="px-4 py-3 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {filteredRules.map((rule) => (
                <tr
                  key={rule._id}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                  onClick={() =>
                    navigate({
                      to: "/membership/restrictions/$ruleId/edit",
                      params: { ruleId: String(rule._id) },
                    })
                  }
                >
                  <td className="px-4 py-3">
                    <ResourceCell
                      resourceType={rule.resourceType}
                      resourceIdOrKey={rule.resourceIdOrKey}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <RuleModeBadge mode={rule.ruleMode} />
                  </td>
                  <td className="px-4 py-3">
                    <PlansCell plans={rule.plans} />
                  </td>
                  <td className="px-4 py-3">
                    <TeaserBadge mode={rule.teaserMode} />
                  </td>
                  <td className="px-4 py-3">
                    {rule.loginRequired ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        <LogIn className="h-3 w-3" />
                        Required
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        Optional
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {formatDate(rule.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Cells ────────────────────────────────────────────────────────────────

function ResourceCell({
  resourceType,
  resourceIdOrKey,
}: {
  resourceType: ResourceType;
  resourceIdOrKey: string;
}) {
  const typeInfo: Record<
    ResourceType,
    { icon: React.ElementType; label: string }
  > = {
    post: { icon: FileText, label: "Post" },
    page: { icon: FileText, label: "Page" },
    product: { icon: Box, label: "Product" },
    route: { icon: LinkIcon, label: "Route" },
    block: { icon: FileCode, label: "Block" },
  };
  const Info = typeInfo[resourceType];
  const Icon = Info.icon;
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {Info.label}
        </p>
        <p className="truncate font-mono text-xs font-medium text-foreground">
          {resourceIdOrKey}
        </p>
      </div>
    </div>
  );
}

function RuleModeBadge({ mode }: { mode: RuleMode }) {
  if (mode === "allow_only") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
        <ShieldCheck className="h-3 w-3" />
        Allow only
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
      <ShieldOff className="h-3 w-3" />
      Deny if missing
    </span>
  );
}

function PlansCell({
  plans,
}: {
  plans: Array<{ _id: string; title: string; slug: string }>;
}) {
  if (plans.length === 0) {
    return (
      <span className="text-[11px] italic text-muted-foreground">
        No plans
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {plans.slice(0, 3).map((plan) => (
        <span
          key={plan._id}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          <Lock className="h-3 w-3" />
          {plan.title}
        </span>
      ))}
      {plans.length > 3 && (
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          +{plans.length - 3}
        </span>
      )}
    </div>
  );
}

function TeaserBadge({ mode }: { mode: TeaserMode }) {
  const info: Record<TeaserMode, { icon: React.ElementType; label: string }> = {
    hide: { icon: EyeOff, label: "Hide" },
    excerpt: { icon: Type, label: "Excerpt" },
    custom_message: { icon: MessageSquare, label: "Message" },
  };
  const I = info[mode];
  const Icon = I.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <Icon className="h-3 w-3" />
      {I.label}
    </span>
  );
}

// ─── Empty + disabled states ──────────────────────────────────────────────

function EmptyState({
  hasAnyRules,
  onCreate,
}: {
  hasAnyRules: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {hasAnyRules
            ? "No rules match the current filter."
            : "No restriction rules yet."}
        </p>
        <p className="text-xs text-muted-foreground">
          {hasAnyRules
            ? "Try a different filter, or create a rule for another resource."
            : "Create a rule to gate posts, pages, products, routes, or reusable blocks."}
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Plus className="h-3.5 w-3.5" />
        New rule
      </button>
    </div>
  );
}

function PluginDisabledNotice() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Restrictions</h1>
        <p className="text-sm text-muted-foreground">
          Rules that gate posts, pages, products, routes, and reusable blocks
          behind membership plans.
        </p>
      </div>
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-10 text-center">
        <p className="text-sm font-medium text-foreground">
          Membership plugin is disabled.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Enable the membership plugin in Plugins to manage restrictions.
        </p>
      </div>
    </div>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
