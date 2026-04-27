/**
 * Membership Settings — extension toggle, configuration links, capability
 * mapping overview, access log status, and commerce subscription bridge
 * overview.
 *
 * All read-only diagnostics use existing Convex queries:
 *   - api.roles.queries.listRoles
 *   - api.membership.queries.listPlans
 *   - api.membership.queries.getStats
 */

import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import {
  BookOpen,
  CheckCircle2,
  FileText,
  Lock,
  Save,
  Shield,
  Unlink,
  Link2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { usePluginSettings } from "@/hooks/usePluginSettings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/membership/settings",
)({
  component: MembershipSettingsPage,
});

type PlanRow = {
  _id: Id<"membership_plans">;
  title: string;
  slug: string;
  status: "draft" | "active" | "archived";
  linkedSubscriptionCode?: string;
  linkedRoleId?: Id<"roles">;
  linkedCapabilities?: string[];
  priority: number;
};

type RoleRow = {
  _id: Id<"roles">;
  name: string;
  slug: string;
  level: number;
  capabilities?: string[];
  userCount?: number;
};

type MembershipStats = {
  totalPlans: number;
  activePlans: number;
  totalRestrictionRules: number;
  totalGrants: number;
  activeGrants: number;
  graceGrants: number;
  revokedGrants: number;
  expiredGrants: number;
  expiringSoon: number;
  planBreakdown: Array<{
    planId: Id<"membership_plans">;
    title: string;
    slug: string;
    activeMembers: number;
  }>;
};

function MembershipSettingsPage() {
  const { isLoading, values } = usePluginSettings();
  const updateSection = useMutation(api.settings.mutations.updateSection);

  const plans = useQuery(
    (api as any).membership.queries.listPlans,
    {},
  ) as PlanRow[] | null | undefined;

  const roles = useQuery(
    (api as any).roles.queries.listRoles,
    {},
  ) as RoleRow[] | undefined;

  const stats = useQuery(
    (api as any).membership.queries.getStats,
    {},
  ) as MembershipStats | null | undefined;

  const enabled = Boolean(values.membershipEnabled);

  async function setMembershipEnabled(membershipEnabled: boolean) {
    try {
      await updateSection({
        section: "plugins",
        values: {
          ...values,
          membershipEnabled,
        },
      });
      toast.success("Membership settings saved");
    } catch {
      toast.error("Failed to save membership settings");
    }
  }

  if (isLoading) {
    return <div className="h-48 max-w-3xl animate-pulse rounded-lg bg-muted" />;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Membership Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage membership extension availability and review how plans,
          roles, capabilities, and commerce subscriptions link together.
        </p>
      </div>

      {/* Enable toggle */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Membership Extension</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This flag is stored in the central plugins settings section and
              gates membership routes and backend functions.
            </p>
          </div>
          <Button
            variant={enabled ? "outline" : "default"}
            onClick={() => void setMembershipEnabled(!enabled)}
          >
            <Save className="mr-2 h-4 w-4" />
            {enabled ? "Disable" : "Enable"}
          </Button>
        </div>
      </section>

      {/* Configuration Areas */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Configuration Areas</h2>
        <SettingsLink
          to="/membership/plans"
          title="Plans"
          description="Create plans, linked subscription entitlements, and plan benefits."
        />
        <SettingsLink
          to="/membership/grants"
          title="Grants"
          description="Review and manage active membership grants."
        />
        <SettingsLink
          to="/membership/restrictions"
          title="Restrictions"
          description="Configure content access rules by membership plan."
        />
      </section>

      {/* Capability Mapping */}
      <CapabilityMappingSection
        plans={plans ?? []}
        roles={roles ?? []}
        disabled={!enabled}
      />

      {/* Access Log */}
      <AccessLogSection
        stats={stats ?? null}
        disabled={!enabled}
      />

      {/* Bridge */}
      <BridgeSection
        plans={plans ?? []}
        disabled={!enabled}
      />
    </div>
  );
}

// ─── Capability Mapping ──────────────────────────────────────────────────

function CapabilityMappingSection({
  plans,
  roles,
  disabled,
}: {
  plans: PlanRow[];
  roles: RoleRow[];
  disabled: boolean;
}) {
  const activePlans = plans.filter((p) => p.status === "active");
  const roleById = useMemo(() => {
    const map = new Map<string, RoleRow>();
    for (const role of roles) {
      map.set(String(role._id), role);
    }
    return map;
  }, [roles]);

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Capability Mapping</h2>
          <p className="text-sm text-muted-foreground">
            How active plans map to roles and capabilities. Plans without a
            linked role or capabilities rely purely on grant-based checks.
          </p>
        </div>
        <Link
          to="/membership/plans"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          Manage plans
        </Link>
      </div>

      {disabled ? (
        <p className="text-sm italic text-muted-foreground">
          Enable the membership extension to view capability mappings.
        </p>
      ) : activePlans.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          No active plans yet. Mark a plan Active to see its capability map
          here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Plan</th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
                <th className="px-3 py-2 text-left font-medium">
                  Extra capabilities
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {activePlans.map((plan) => {
                const role = plan.linkedRoleId
                  ? roleById.get(String(plan.linkedRoleId))
                  : null;
                const extras = plan.linkedCapabilities ?? [];
                return (
                  <tr key={plan._id} className="bg-card">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium text-foreground">
                          {plan.title}
                        </span>
                      </div>
                      <span className="ml-5 font-mono text-[11px] text-muted-foreground">
                        {plan.slug}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {role ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {role.name}
                          <span className="text-muted-foreground/70">
                            (L{role.level})
                          </span>
                        </span>
                      ) : (
                        <span className="text-[11px] italic text-muted-foreground">
                          None
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {extras.length === 0 ? (
                        <span className="text-[11px] italic text-muted-foreground">
                          None
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {extras.map((cap) => (
                            <span
                              key={cap}
                              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground"
                            >
                              <Lock className="h-3 w-3" />
                              {cap}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Access Log ──────────────────────────────────────────────────────────

function AccessLogSection({
  stats,
  disabled,
}: {
  stats: MembershipStats | null;
  disabled: boolean;
}) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Access Log</h2>
        <p className="text-sm text-muted-foreground">
          Summary of access-controlled content on this site. Detailed access
          outcomes are written to <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">membership_access_log</code>{" "}
          and rotate according to the retention setting.
        </p>
      </div>

      {disabled ? (
        <p className="text-sm italic text-muted-foreground">
          Enable the membership extension to view access statistics.
        </p>
      ) : !stats ? (
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-4">
          <StatTile
            icon={Shield}
            label="Active plans"
            value={stats.activePlans}
            sublabel={`${stats.totalPlans} total`}
          />
          <StatTile
            icon={FileText}
            label="Restriction rules"
            value={stats.totalRestrictionRules}
            sublabel="across all resources"
          />
          <StatTile
            icon={CheckCircle2}
            label="Active grants"
            value={stats.activeGrants}
            sublabel={`${stats.graceGrants} in grace`}
          />
          <StatTile
            icon={BookOpen}
            label="Expiring soon"
            value={stats.expiringSoon}
            sublabel="next 30 days"
          />
        </div>
      )}
    </section>
  );
}

// ─── Commerce Subscriptions Bridge ───────────────────────────────────────

function BridgeSection({
  plans,
  disabled,
}: {
  plans: PlanRow[];
  disabled: boolean;
}) {
  const linked = plans.filter((p) => !!p.linkedSubscriptionCode);
  const unlinked = plans.filter(
    (p) => p.status === "active" && !p.linkedSubscriptionCode,
  );

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            Commerce Subscriptions Bridge
          </h2>
          <p className="text-sm text-muted-foreground">
            Plans that reference a commerce subscription code are granted
            automatically when a matching subscription activates. Plans without
            a code rely on manual, purchase, or hybrid grants.
          </p>
        </div>
        <Link
          to="/membership/plans"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          Manage plans
        </Link>
      </div>

      {disabled ? (
        <p className="text-sm italic text-muted-foreground">
          Enable the membership extension to view bridge status.
        </p>
      ) : (
        <div className="space-y-4">
          <BridgeGroup
            icon={Link2}
            title="Linked plans"
            description="These plans resolve from a subscription entitlement code."
            items={linked.map((p) => ({
              id: p._id,
              title: p.title,
              subtitle: p.linkedSubscriptionCode ?? "",
              statusLabel: p.status,
            }))}
            emptyLabel="No plans are linked to a subscription code yet."
            tone="ok"
          />
          <BridgeGroup
            icon={Unlink}
            title="Unlinked active plans"
            description="Active plans without a subscription code. Grants can still be issued manually."
            items={unlinked.map((p) => ({
              id: p._id,
              title: p.title,
              subtitle: "(no subscription code)",
              statusLabel: p.status,
            }))}
            emptyLabel="Every active plan is linked to a subscription code."
            tone="warn"
          />
        </div>
      )}
    </section>
  );
}

// ─── Primitives ──────────────────────────────────────────────────────────

function StatTile({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  sublabel?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="mt-1.5 text-2xl font-bold text-foreground">{value}</p>
      {sublabel && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{sublabel}</p>
      )}
    </div>
  );
}

function BridgeGroup({
  icon: Icon,
  title,
  description,
  items,
  emptyLabel,
  tone,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  items: Array<{
    id: string;
    title: string;
    subtitle: string;
    statusLabel: string;
  }>;
  emptyLabel: string;
  tone: "ok" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3",
        tone === "ok"
          ? "border-primary/25 bg-primary/5"
          : "border-border bg-muted/30",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            tone === "ok" ? "text-primary" : "text-muted-foreground",
          )}
        />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      <div className="mt-2.5">
        {items.length === 0 ? (
          <p className="text-[11px] italic text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-background px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {item.subtitle}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {item.statusLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SettingsLink({
  to,
  title,
  description,
}: {
  to: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="block rounded-md border border-border px-4 py-3 transition-colors hover:bg-muted"
    >
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </Link>
  );
}
