/**
 * Customer dashboard — home layouts (/customer-dashboard/layouts)
 *
 * Lists the default layout plus any role:/plan: layouts, and starts a new
 * scoped layout from the roles and plans on this site.
 */

import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { ChevronRight, LayoutGrid, Lock, Plus, Users } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { DashboardTabBar } from "@/components/customer-dashboard/DashboardTabBar";
import { SelectControl, type SelectOptionGroup } from "@/components/customer-dashboard/fields";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeScope, type ScopeOptions } from "@/lib/customer-dashboard/scopes";

export const Route = createFileRoute("/_authenticated/_admin/customer-dashboard/layouts/")({
  component: LayoutsPage,
});

function LayoutsPage() {
  return (
    <PluginGuard pluginId="dashboard">
      <LayoutsList />
    </PluginGuard>
  );
}

interface LayoutRow {
  _id: string;
  scope: string;
  title: string;
  itemCount: number;
  membersCanEdit: boolean;
  updatedAt: number;
}

function formatWhen(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

function LayoutsList() {
  const layouts = useQuery(api.extensions.dashboard.queries.defaultLayouts) as LayoutRow[] | undefined;
  const scopeOptions = useQuery(api.extensions.dashboard.queries.scopeOptions) as ScopeOptions | undefined;
  const navigate = useNavigate();
  const [newScope, setNewScope] = useState("");

  const existing = useMemo(() => new Set((layouts ?? []).map((layout) => layout.scope)), [layouts]);
  const rows = useMemo(() => {
    const list = [...(layouts ?? [])];
    if (!existing.has("default")) {
      list.unshift({ _id: "default", scope: "default", title: "Everyone", itemCount: 0, membersCanEdit: true, updatedAt: 0 });
    }
    return list.sort((a, b) => (a.scope === "default" ? -1 : b.scope === "default" ? 1 : a.scope.localeCompare(b.scope)));
  }, [existing, layouts]);

  const scopeChoices = useMemo<SelectOptionGroup[]>(() => {
    const roles = (scopeOptions?.roles ?? [])
      .filter((role) => !existing.has(`role:${role.slug}`))
      .map((role) => ({ value: `role:${role.slug}`, label: role.name, description: `role · ${role.slug}` }));
    const plans = (scopeOptions?.plans ?? [])
      .filter((plan) => !existing.has(`plan:${plan.slug}`))
      .map((plan) => ({ value: `plan:${plan.slug}`, label: plan.name, description: `membership plan · ${plan.slug}` }));
    const groups: SelectOptionGroup[] = [];
    if (roles.length) groups.push({ label: "Roles", options: roles });
    if (plans.length) groups.push({ label: "Membership plans", options: plans });
    return groups;
  }, [existing, scopeOptions]);

  return (
    <div className="space-y-[18px]">
      <PageHeader
        eyebrow="Customer dashboard"
        title="Home layouts"
        meta={[
          <span key="count">{rows.length} layout{rows.length === 1 ? "" : "s"}</span>,
          <span key="hint">Most specific wins: plan, then role, then everyone</span>,
        ]}
      />
      <DashboardTabBar />

      <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card data-size="sm">
          <CardHeader>
            <CardTitle>Layouts</CardTitle>
            <CardDescription>The widget arrangement a member starts with. Members can rearrange their own copy when allowed.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {layouts === undefined ? (
              <div className="space-y-2 px-4 pb-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {rows.map((layout) => {
                  const scope = describeScope(layout.scope, scopeOptions);
                  const saved = existing.has(layout.scope);
                  return (
                    <li key={layout.scope}>
                      <Link
                        to="/customer-dashboard/layouts/$scope"
                        params={{ scope: layout.scope }}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
                          {scope.kind === "default" ? <LayoutGrid className="size-4" /> : <Users className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[13.5px] font-semibold text-foreground">{layout.title}</span>
                            <Badge variant="outline" className="h-4 px-1.5 text-[10px] uppercase">
                              {scope.kind === "default" ? "default" : scope.kind}
                            </Badge>
                            {!saved && (
                              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                                platform default
                              </Badge>
                            )}
                            {!layout.membersCanEdit && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Lock className="size-3" aria-hidden="true" />
                                locked
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {saved
                              ? `${layout.itemCount} widget${layout.itemCount === 1 ? "" : "s"} · saved ${formatWhen(layout.updatedAt)}`
                              : "Built from the widgets marked default in the registry"}
                            {layout.scope !== "default" && <span className="font-mono"> · {layout.scope}</span>}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card data-size="sm">
          <CardHeader>
            <CardTitle>New layout for a role or plan</CardTitle>
            <CardDescription>Members with that role or an active plan get this home instead of the default.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {scopeOptions === undefined ? (
              <div className="h-9 animate-pulse rounded-lg bg-muted" />
            ) : scopeChoices.length === 0 ? (
              <p className="text-xs text-muted-foreground">Every role and plan already has a layout.</p>
            ) : (
              <SelectControl value={newScope} onValueChange={setNewScope} options={scopeChoices} placeholder="Choose a role or plan" aria-label="Scope for the new layout" />
            )}
            <Button
              disabled={!newScope}
              onClick={() => void navigate({ to: "/customer-dashboard/layouts/$scope", params: { scope: newScope } })}
              className="self-start"
            >
              <Plus data-icon="inline-start" />
              Start layout
            </Button>
            <p className="text-xs text-muted-foreground">The new layout starts from the platform default; nothing is stored until you save.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
