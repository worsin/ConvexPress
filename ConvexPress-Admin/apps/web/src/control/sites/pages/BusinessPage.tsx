import { HostingAccountsPanel } from "../../components/HostingAccountsPanel";
import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Globe2, PackageOpen, PencilLine, Plus, Power } from "lucide-react";

import { HealthDot } from "@/components/shell/EnvironmentChip";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import type { WorkspaceApi } from "../SitesWorkspace";
import { findBusiness, kindLabel } from "../sites-model";
import { useSitesAccess } from "../useSitesAccess";
import { AccessList } from "./AccessList";

export function BusinessPage({ api, businessId }: { api: WorkspaceApi; businessId: string }) {
  const found = findBusiness(api.tree, businessId);
  const details = useQuery(
    controlApi.businesses.list,
    found ? { organizationId: found.organization.organizationId as Id<"overseer_organizations"> } : "skip",
  );
  const detail = details?.find((entry) => String(entry.businessId) === businessId);
  const access = useSitesAccess({
    organizationId: found?.organization.organizationId,
    businessId,
  });
  const updateBusiness = useMutation(controlApi.businesses.update);
  if (!found) return null;
  const { organization, business } = found;

  return (
    <div className="space-y-7">
      <PageHeader
        size="md"
        eyebrow={
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => api.select({ type: "organization", id: organization.organizationId })}
          >
            {organization.name}
          </button>
        }
        title={
          <span className="inline-flex items-center gap-3">
            {detail?.accentColor && (
              <span
                aria-hidden="true"
                className="inline-block size-3.5 rounded-full border border-border"
                style={{ background: detail.accentColor }}
              />
            )}
            {business.name}
          </span>
        }
        meta={[
          <span key="slug" className="font-mono text-[12px] text-muted-foreground">{business.slug}</span>,
          <span key="count">{business.websites.length} {business.websites.length === 1 ? "website" : "websites"}</span>,
        ]}
        actions={
          <>
            {access.updateBusiness && (
              <>
                <Button variant="outline" onClick={() => api.openTransfer(businessId)}>
                  <PackageOpen data-icon="inline-start" aria-hidden="true" />
                  Import or transfer
                </Button>
                <Button variant="outline" onClick={() => api.openDialog({ kind: "edit-business", businessId })}>
                  <PencilLine data-icon="inline-start" aria-hidden="true" />
                  Edit
                </Button>
                <Button
                  onClick={() =>
                    api.openDialog({
                      kind: "add-website",
                      organizationId: organization.organizationId,
                      businessId,
                    })
                  }
                >
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  Add website
                </Button>
              </>
            )}
          </>
        }
      />

      {detail?.description && (
        <p className="max-w-2xl text-[13.5px] leading-6 text-ink-2">{detail.description}</p>
      )}

      <HostingAccountsPanel organizationId={organization.organizationId} businessId={businessId} />

      <section aria-label="Websites" className="space-y-3">
        <h2 className="text-[15px] font-semibold">Websites</h2>
        {business.websites.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong p-6 text-center">
            <p className="text-[13.5px] text-ink-2">
              No websites yet. Register one and point it at its own Convex deployment.
            </p>
            {access.updateBusiness && (
              <Button
                className="mt-4"
                onClick={() =>
                  api.openDialog({
                    kind: "add-website",
                    organizationId: organization.organizationId,
                    businessId,
                  })
                }
              >
                <Plus data-icon="inline-start" aria-hidden="true" />
                Add website
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {business.websites.map((website) => (
              <button
                key={website.websiteId}
                type="button"
                onClick={() => api.select({ type: "website", id: website.websiteId })}
                className="flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 text-left shadow-soft transition-colors hover:border-line-strong"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <Globe2 aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-foreground">{website.title}</span>
                    {website.isDefault && (
                      <span className="rounded-md bg-surface-2 px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Default
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">{website.primaryDomain}</span>
                  <span className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
                    {website.environments.length === 0 ? (
                      <span className="text-[12px] text-muted-foreground">No environments attached</span>
                    ) : (
                      website.environments.map((environment) => (
                        <span key={environment.instanceId} className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
                          <HealthDot environment={environment} />
                          {environment.label ?? kindLabel(environment.kind)}
                        </span>
                      ))
                    )}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <AccessList
        api={api}
        canManagePeople={access.managePeople}
        targetType="business"
        targetId={businessId}
        label={business.name}
        inviteScope={{ organizationId: organization.organizationId, businessId }}
      />

      {access.manageHierarchy && (
        <section aria-label="Danger zone" className="rounded-xl border border-destructive/30 p-4">
          <h2 className="text-[13.5px] font-semibold text-destructive">Deactivate business</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-5 text-ink-2">
            Hides this business and its websites from every operator. Databases are untouched and an administrator can reactivate it later.
          </p>
          <Button
            variant="outline"
            className="mt-3 border-destructive/40 text-destructive hover:bg-live-soft"
            onClick={() =>
              api.openDialog({
                kind: "confirm",
                request: {
                  title: `Deactivate ${business.name}`,
                  description: "Operators lose access to every website in this business until it is reactivated.",
                  phrase: `DEACTIVATE BUSINESS ${business.slug}`,
                  ariaLabel: "Business deactivation confirmation",
                  confirmLabel: "Deactivate business",
                  onConfirm: async () => {
                    await updateBusiness({ businessId: businessId as Id<"overseer_businesses">, isActive: false });
                    api.select({ type: "organization", id: organization.organizationId });
                    return `${business.name} deactivated.`;
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
