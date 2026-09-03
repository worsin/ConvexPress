/**
 * Overview — the landing page of the Sites workspace.
 * Portfolio counts, environments that need attention, and quick actions.
 * A brand-new installation sees a single, calm "register your first
 * website" invitation instead.
 */

import { ArrowRight, Globe2, Plus, UserPlus } from "lucide-react";
import { useMemo } from "react";

import { EnvironmentChip, HealthDot } from "@/components/shell/EnvironmentChip";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { useControlShell } from "@/control/ControlShellContext";
import type { WorkspaceApi } from "../SitesWorkspace";
import { attentionItems, type PortfolioCounts } from "../sites-model";
import { useSitesAccess } from "../useSitesAccess";

export function OverviewPage({ api, counts }: { api: WorkspaceApi; counts: PortfolioCounts }) {
  const shell = useControlShell()!;
  const access = useSitesAccess({});
  const attention = useMemo(() => attentionItems(api.tree), [api.tree]);

  if (api.tree.length === 0) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="max-w-md text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
            <Globe2 aria-hidden="true" className="size-6" />
          </span>
          <p className="eyebrow mt-6">Nothing here yet</p>
          <h1 className="mt-2 font-serif text-[34px] leading-none tracking-[-0.01em]">
            Register your first website
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-[13.5px] leading-6 text-ink-2">
            A website is its own isolated Convex deployment. You give ConvexPress its
            address and an admin key; everything else stays inside that database.
          </p>
          <Button className="mt-6 h-10" onClick={() => api.openDialog({ kind: "add-website" })}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Add website
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader
        size="md"
        eyebrow={`Signed in as ${shell.operator.displayName}`}
        title="Everything you manage"
        meta={[
          <span key="o">{counts.organizations} {counts.organizations === 1 ? "organization" : "organizations"}</span>,
          <span key="b">{counts.businesses} {counts.businesses === 1 ? "business" : "businesses"}</span>,
          <span key="w">{counts.websites} {counts.websites === 1 ? "website" : "websites"}</span>,
          <span key="e">{counts.environments} {counts.environments === 1 ? "environment" : "environments"}, {counts.live} live</span>,
        ]}
        actions={
          <>
            {access.managePeople && (
              <Button variant="outline" onClick={() => api.openDialog({ kind: "invite" })}>
                <UserPlus data-icon="inline-start" aria-hidden="true" />
                Invite operator
              </Button>
            )}
            <Button onClick={() => api.openDialog({ kind: "add-website" })}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              Add website
            </Button>
          </>
        }
      />

      <section aria-label="Needs attention" className="rounded-xl border border-border bg-card shadow-soft">
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
          <h2 className="text-[15px] font-semibold">Needs attention</h2>
          <span className="text-[12px] text-muted-foreground">
            {attention.length === 0 ? "All clear" : `${attention.length} ${attention.length === 1 ? "environment" : "environments"}`}
          </span>
        </div>
        {attention.length === 0 ? (
          <p className="border-t border-border px-[18px] py-4 text-[13px] text-muted-foreground">
            Every environment is reachable and running a compatible contract.
          </p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {attention.slice(0, 8).map((item) => (
              <li key={item.environment.instanceId}>
                <button
                  type="button"
                  onClick={() => api.select({ type: "website", id: item.website.websiteId })}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-[18px] py-2.5 text-left hover:bg-surface-2"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <HealthDot tone={item.tone} />
                    <span className="truncate text-[13.5px] font-medium text-foreground">{item.website.title}</span>
                    <EnvironmentChip environment={item.environment} size="sm" />
                  </span>
                  <span className="text-[12.5px] text-ink-2">{item.reason}</span>
                  <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Organizations" className="space-y-3">
        <h2 className="text-[15px] font-semibold">Organizations</h2>
        <div className="grid gap-3.5 sm:grid-cols-2">
          {api.tree.map((organization) => {
            const websites = organization.businesses.reduce((sum, b) => sum + b.websites.length, 0);
            return (
              <button
                key={organization.organizationId}
                type="button"
                onClick={() => api.select({ type: "organization", id: organization.organizationId })}
                className="rounded-xl border border-border bg-card p-4 text-left shadow-soft transition-colors hover:border-line-strong"
              >
                <p className="eyebrow">Organization</p>
                <p className="mt-1 truncate text-[16px] font-semibold text-foreground">{organization.name}</p>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  {organization.businesses.length} {organization.businesses.length === 1 ? "business" : "businesses"} · {websites} {websites === 1 ? "website" : "websites"}
                </p>
              </button>
            );
          })}
          {access.manageHierarchy && (
            <button
              type="button"
              onClick={() => api.openDialog({ kind: "new-organization" })}
              className="grid min-h-[104px] place-items-center rounded-xl border border-dashed border-line-strong p-4 text-[13px] font-medium text-ink-2 transition-colors hover:border-primary hover:text-foreground"
            >
              <span className="inline-flex items-center gap-1.5">
                <Plus aria-hidden="true" className="size-4" /> New organization
              </span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
