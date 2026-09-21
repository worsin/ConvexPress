import { PromotionReviewPanel } from "../../components/PromotionReviewPanel";
import { CloudEnvironmentsPanel } from "../../components/CloudEnvironmentsPanel";
import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Archive, ExternalLink, PackageOpen, PencilLine, Plus } from "lucide-react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { EnvironmentCard } from "../EnvironmentCard";
import type { WorkspaceApi } from "../SitesWorkspace";
import { findWebsite, sortEnvironments } from "../sites-model";
import { useEnvironmentsAccess, useSitesAccess } from "../useSitesAccess";
import { AccessList } from "./AccessList";

export function WebsitePage({ api, websiteId }: { api: WorkspaceApi; websiteId: string }) {
  const found = findWebsite(api.tree, websiteId);
  const websiteIdTyped = websiteId as Id<"overseer_websites">;
  const details = useQuery(
    controlApi.websites.list,
    found ? { businessId: found.business.businessId as Id<"overseer_businesses"> } : "skip",
  );
  const detail = details?.find((entry) => String(entry.websiteId) === websiteId);
  const environments = useQuery(controlApi.websiteInstances.list, { websiteId: websiteIdTyped });
  const connections = useQuery(controlApi.connections.queries.listForWebsite, {
    websiteId: websiteIdTyped,
  });
  const access = useSitesAccess({
    organizationId: found?.organization.organizationId,
    businessId: found?.business.businessId,
    websiteId,
  });
  const archiveWebsite = useMutation(controlApi.websites.archive);
  const sorted = [...(environments ?? [])].sort((left, right) =>
    sortEnvironments(
      { ...left, instanceId: String(left.instanceId), websiteId: String(left.websiteId), label: left.label ?? null },
      { ...right, instanceId: String(right.instanceId), websiteId: String(right.websiteId), label: right.label ?? null },
    ),
  );
  // One subscription for every environment's capabilities (hooks stay unconditional).
  const environmentAccess = useEnvironmentsAccess(
    found
      ? sorted.map((entry) => ({
          organizationId: found.organization.organizationId,
          businessId: found.business.businessId,
          websiteId,
          instanceId: String(entry.instanceId),
          isLive: entry.kind === "live",
        }))
      : [],
  );
  if (!found) return null;
  const { organization, business, website } = found;
  const defaultEnvironment = sorted.find((entry) => entry.isDefault) ?? sorted[0];
  const connectionsByInstance = new Map(
    (connections ?? []).map((entry) => [String(entry.instanceId), entry.connections]),
  );
  const canArchive = access.updateWebsite && (environments?.length ?? 1) === 0;
  const defaultConnected = defaultEnvironment
    ? (connectionsByInstance.get(String(defaultEnvironment.instanceId)) ?? []).some(
        (entry) => entry.isActive && entry.status === "connected" && entry.hasCredentials,
      )
    : false;

  return (
    <div className="space-y-7">
      <PageHeader
        size="md"
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <button type="button" className="hover:text-foreground" onClick={() => api.select({ type: "organization", id: organization.organizationId })}>
              {organization.name}
            </button>
            <span aria-hidden="true">›</span>
            <button type="button" className="hover:text-foreground" onClick={() => api.select({ type: "business", id: business.businessId })}>
              {business.name}
            </button>
          </span>
        }
        title={website.title}
        meta={[
          <a
            key="domain"
            href={`https://${website.primaryDomain}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
          >
            {website.primaryDomain}
            <ExternalLink aria-hidden="true" className="size-3" />
          </a>,
          <span key="key" className="font-mono text-[12px] text-muted-foreground">{website.websiteKey}</span>,
          website.isDefault ? <span key="default">Default for {business.name}</span> : null,
        ].filter(Boolean)}
        actions={
          <>
            {defaultEnvironment && (
              <Button
                variant="outline"
                disabled={!defaultConnected}
                title={defaultConnected ? undefined : "Connect the controller to open this site"}
                onClick={() => api.openInShell(websiteId, String(defaultEnvironment.instanceId))}
              >
                Open in ConvexPress
              </Button>
            )}
            {access.updateWebsite && (
              <>
                <Button variant="outline" onClick={() => api.openDialog({ kind: "edit-website", websiteId })}>
                  <PencilLine data-icon="inline-start" aria-hidden="true" />
                  Edit
                </Button>
                <Button onClick={() => api.openDialog({ kind: "attach-environment", websiteId })}>
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  Attach environment
                </Button>
              </>
            )}
          </>
        }
      />

      {detail?.description && (
        <p className="max-w-2xl text-[13.5px] leading-6 text-ink-2">{detail.description}</p>
      )}

      <CloudEnvironmentsPanel primaryDomain={website.primaryDomain} websiteKey={website.websiteKey} organizationId={organization.organizationId} businessId={business.businessId} websiteId={websiteId} name={website.title} />

      <section aria-label="Environments" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Environments</h2>
          <span className="text-[12px] text-muted-foreground">
            Each environment is its own isolated Convex database.
          </span>
        </div>
        {environments === undefined ? (
          <p className="text-[13px] text-muted-foreground">Loading environments…</p>
        ) : sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong p-6 text-center">
            <p className="text-[13.5px] text-ink-2">
              This website has no environments yet. Use Cloud environments to create or adopt production and staging databases, or attach an existing deployment.
            </p>
            {access.updateWebsite && (
              <Button className="mt-4" onClick={() => api.openDialog({ kind: "attach-environment", websiteId })}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                Attach environment
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3.5">
            {sorted.map((environment) => (
              <EnvironmentCard
                key={String(environment.instanceId)}
                api={api}
                organizationId={organization.organizationId}
                businessId={business.businessId}
                websiteId={websiteId}
                environment={environment}
                connections={connectionsByInstance.get(String(environment.instanceId)) ?? []}
                canEdit={access.updateWebsite}
                access={
                  environmentAccess.get(String(environment.instanceId)) ?? {
                    loading: true,
                    manageConnection: false,
                    liveAllowed: environment.kind !== "live",
                    operations: false,
                  }
                }
              />
            ))}
          </div>
        )}
      </section>

      <PromotionReviewPanel websiteId={websiteId} websiteKey={website.websiteKey} organizationId={organization.organizationId} businessId={business.businessId} environments={environments ?? []} connections={connections ?? []} />

      <AccessList
        api={api}
        canManagePeople={access.managePeople}
        targetType="website"
        targetId={websiteId}
        label={website.title}
        inviteScope={{ organizationId: organization.organizationId, businessId: business.businessId, websiteId }}
      />

      {access.updateWebsite && (
        <section aria-label="Transfer and archive" className="grid gap-3.5 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
            <h2 className="text-[13.5px] font-semibold">Transfer this website</h2>
            <p className="mt-1 text-[13px] leading-5 text-ink-2">
              Export a portable package so another ConvexPress or Virtual Overseer controller can take over. Keys are never included.
            </p>
            <Button
              variant="outline"
              className="mt-3"
              disabled={!defaultEnvironment}
              onClick={() =>
                defaultEnvironment &&
                api.openTransfer(business.businessId, websiteId, String(defaultEnvironment.instanceId))
              }
            >
              <PackageOpen data-icon="inline-start" aria-hidden="true" />
              Transfer site
            </Button>
          </div>
          <div className="rounded-xl border border-destructive/30 p-4">
            <h2 className="text-[13.5px] font-semibold text-destructive">Archive website</h2>
            <p className="mt-1 text-[13px] leading-5 text-ink-2">
              {canArchive
                ? "Removes this website from the portfolio. Its databases are not touched."
                : "Archive every environment first; a website with a live deployment cannot be archived."}
            </p>
            <Button
              variant="outline"
              className="mt-3 border-destructive/40 text-destructive hover:bg-live-soft"
              disabled={!canArchive}
              onClick={() =>
                api.openDialog({
                  kind: "confirm",
                  request: {
                    title: `Archive ${website.title}`,
                    description: "The website disappears from every operator's portfolio. Databases are left exactly as they are.",
                    phrase: `ARCHIVE WEBSITE ${website.websiteKey}`,
                    ariaLabel: "Website archive confirmation",
                    confirmLabel: "Archive website",
                    onConfirm: async () => {
                      await archiveWebsite({
                        websiteId: websiteIdTyped,
                        confirmation: `ARCHIVE WEBSITE ${website.websiteKey}`,
                      });
                      api.select({ type: "business", id: business.businessId });
                      return `${website.title} archived.`;
                    },
                  },
                })
              }
            >
              <Archive data-icon="inline-start" aria-hidden="true" />
              Archive
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
