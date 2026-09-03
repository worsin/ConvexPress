import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Building2, PencilLine, Plus, Power } from "lucide-react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import type { WorkspaceApi } from "../SitesWorkspace";
import { useSitesAccess } from "../useSitesAccess";
import { AccessList } from "./AccessList";

export function OrganizationPage({ api, organizationId }: { api: WorkspaceApi; organizationId: string }) {
  const organization = api.tree.find((entry) => entry.organizationId === organizationId);
  const details = useQuery(controlApi.organizations.list, {});
  const detail = details?.find((entry) => String(entry.organizationId) === organizationId);
  const access = useSitesAccess({ organizationId });
  const updateOrganization = useMutation(controlApi.organizations.update);
  if (!organization) return null;

  const websites = organization.businesses.reduce((sum, b) => sum + b.websites.length, 0);

  return (
    <div className="space-y-7">
      <PageHeader
        size="md"
        eyebrow="Organization"
        title={organization.name}
        meta={[
          <span key="slug" className="font-mono text-[12px] text-muted-foreground">{organization.slug}</span>,
          <span key="counts">{organization.businesses.length} {organization.businesses.length === 1 ? "business" : "businesses"} · {websites} {websites === 1 ? "website" : "websites"}</span>,
        ]}
        actions={
          access.manageHierarchy ? (
            <>
              <Button variant="outline" onClick={() => api.openDialog({ kind: "edit-organization", organizationId })}>
                <PencilLine data-icon="inline-start" aria-hidden="true" />
                Edit
              </Button>
              <Button onClick={() => api.openDialog({ kind: "new-business", organizationId })}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                New business
              </Button>
            </>
          ) : undefined
        }
      />

      {detail?.description && (
        <p className="max-w-2xl text-[13.5px] leading-6 text-ink-2">{detail.description}</p>
      )}

      <section aria-label="Businesses" className="space-y-3">
        <h2 className="text-[15px] font-semibold">Businesses</h2>
        {organization.businesses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong p-6 text-center">
            <p className="text-[13.5px] text-ink-2">No businesses yet. A business groups the websites of one client or brand.</p>
            {access.manageHierarchy && (
              <Button className="mt-4" onClick={() => api.openDialog({ kind: "new-business", organizationId })}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                New business
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {organization.businesses.map((business) => (
              <button
                key={business.businessId}
                type="button"
                onClick={() => api.select({ type: "business", id: business.businessId })}
                className="flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 text-left shadow-soft transition-colors hover:border-line-strong"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
                  <Building2 aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-foreground">{business.name}</span>
                  <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                    {business.websites.length} {business.websites.length === 1 ? "website" : "websites"}
                    {business.websites.length > 0 && ` · ${business.websites.map((w) => w.title).slice(0, 3).join(", ")}${business.websites.length > 3 ? "…" : ""}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <AccessList api={api} targetType="organization" targetId={organizationId} label={organization.name} />

      {access.manageHierarchy && (
        <section aria-label="Danger zone" className="rounded-xl border border-destructive/30 p-4">
          <h2 className="text-[13.5px] font-semibold text-destructive">Deactivate organization</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-5 text-ink-2">
            Hides this organization and everything under it from every operator. Websites keep their databases untouched and can be reactivated later by an administrator.
          </p>
          <Button
            variant="outline"
            className="mt-3 border-destructive/40 text-destructive hover:bg-live-soft"
            onClick={() =>
              api.openDialog({
                kind: "confirm",
                request: {
                  title: `Deactivate ${organization.name}`,
                  description: "Operators lose access to every business and website in this organization until it is reactivated.",
                  phrase: `DEACTIVATE ORGANIZATION ${organization.slug}`,
                  ariaLabel: "Organization deactivation confirmation",
                  confirmLabel: "Deactivate organization",
                  onConfirm: async () => {
                    await updateOrganization({
                      organizationId: organizationId as Id<"overseer_organizations">,
                      isActive: false,
                    });
                    api.select({ type: "overview" });
                    return `${organization.name} deactivated.`;
                  },
                },
              })
            }
          >
            <Power data-icon="inline-start" aria-hidden="true" />
            Deactivate
          </Button>
        </section>
      )}
    </div>
  );
}
