import { WebsitePublishingPanel } from "../components/WebsitePublishingPanel";
/**
 * Environment card — one isolated deployment of a website.
 *
 * Shows identity (kind, label, key), its three addresses, health and
 * contract state, versions, and the controller connection with the actions
 * that belong to it: connect, test, rotate, revoke. The overflow menu holds
 * open, make default, operations and backups, edit, and archive.
 */

import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useAction, useMutation } from "convex/react";
import {
  Activity,
  Archive,
  Check,
  Copy,
  History,
  KeyRound,
  Loader2,
  MoreHorizontal,
  PencilLine,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { EnvironmentChip, HealthDot } from "@/components/shell/EnvironmentChip";
import { environmentStatusText } from "@/components/shell/environment-presentation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { expectedConnectionRevocation } from "../components/site-manager-view";
import type { WorkspaceApi } from "./SitesWorkspace";
import type { EnvironmentAccess } from "./useSitesAccess";

type EnvironmentDetail = FunctionReturnType<typeof controlApi.websiteInstances.list>[number];
type ConnectionSummary = FunctionReturnType<
  typeof controlApi.connections.queries.listForWebsite
>[number]["connections"][number];

interface EnvironmentCardProps {
  api: WorkspaceApi;
  organizationId: string;
  businessId: string;
  websiteId: string;
  environment: EnvironmentDetail;
  connections: ConnectionSummary[];
  canEdit: boolean;
  /** Resolved by the page for every environment in one subscription. */
  access: EnvironmentAccess;
}

export function EnvironmentCard({
  api,
  organizationId,
  businessId,
  websiteId,
  environment,
  connections,
  canEdit,
  access,
}: EnvironmentCardProps) {
  const instanceId = String(environment.instanceId);
  const isLive = environment.kind === "live";
  const setDefault = useMutation(controlApi.websiteInstances.setDefault);
  const archiveEnvironment = useMutation(controlApi.websiteInstances.archive);
  const testConnection = useAction(controlApi.connections.actions.test);
  const rotateConnection = useAction(controlApi.connections.actions.rotate);
  const revokeConnection = useAction(controlApi.connections.actions.revoke);

  const activeConnection = connections.find(
    (entry) => entry.isActive && (entry.status === "connected" || entry.status === "error") && entry.hasCredentials,
  );
  const lastCheck = activeConnection?.latestHealth ?? null;
  const treeEnvironment = {
    instanceId,
    websiteId,
    instanceKey: environment.instanceKey,
    kind: environment.kind,
    label: environment.label ?? null,
    deploymentOrigin: environment.deploymentOrigin,
    managementOrigin: environment.managementOrigin,
    siteOrigin: environment.siteOrigin,
    health: environment.health,
    compatibility: environment.compatibility,
    isDefault: environment.isDefault,
  };
  const busy = api.pending !== null;
  const canManageConnection = access.manageConnection;

  return (
    <article
      aria-label={`${environment.label ?? environment.kind} environment`}
      data-environment-kind={environment.kind}
      className={cn(
        "rounded-xl border bg-card shadow-soft",
        isLive ? "border-live/30" : "border-border",
      )}
    >
      <header className="flex flex-wrap items-center gap-3 px-[18px] pb-3 pt-3.5">
        <EnvironmentChip environment={treeEnvironment} />
        <span className="text-[15px] font-semibold text-foreground">
          {environment.label ?? kindTitle(environment.kind)}
        </span>
        {environment.isDefault && (
          <span className="rounded-md bg-surface-2 px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Default
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
          <HealthDot environment={treeEnvironment} />
          {environmentStatusText(treeEnvironment)}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={activeConnection?.status !== "connected"}
          title={activeConnection?.status === "connected" ? undefined : "Verify the controller connection to open this environment"}
          onClick={() => api.openInShell(websiteId, instanceId)}
        >
          Open
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`More actions for ${environment.label ?? environment.kind}`}
            className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-muted hover:text-foreground aria-expanded:bg-muted"
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {access.operations && (
              <DropdownMenuItem onClick={() => api.openOperations(websiteId, instanceId)}>
                <History aria-hidden="true" /> Operations and backups
              </DropdownMenuItem>
            )}
            {canEdit && !environment.isDefault && access.liveAllowed && (
              <DropdownMenuItem
                disabled={busy}
                onClick={() =>
                  void api.run(
                    `default-${instanceId}`,
                    () => setDefault({ instanceId: environment.instanceId }),
                    "Default environment changed.",
                  )
                }
              >
                <Star aria-hidden="true" /> Make default
              </DropdownMenuItem>
            )}
            {canEdit && access.liveAllowed && (
              <DropdownMenuItem
                onClick={() => api.openDialog({ kind: "edit-environment", websiteId, environment: treeEnvironment })}
              >
                <PencilLine aria-hidden="true" /> Edit addresses and versions
              </DropdownMenuItem>
            )}
            {canEdit && access.liveAllowed && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    api.openDialog({
                      kind: "confirm",
                      request: {
                        title: `Archive ${environment.label ?? kindTitle(environment.kind)}`,
                        description: activeConnection
                          ? "Revoke the active controller connection first. Archiving never deletes the database."
                          : "The environment leaves the portfolio. Its database is not deleted.",
                        phrase: `ARCHIVE ENVIRONMENT ${environment.instanceKey}`,
                        ariaLabel: "Environment archive confirmation",
                        confirmLabel: "Archive environment",
                        onConfirm: async () => {
                          await archiveEnvironment({
                            instanceId: environment.instanceId,
                            confirmation: `ARCHIVE ENVIRONMENT ${environment.instanceKey}`,
                          });
                          return "Environment archived.";
                        },
                      },
                    })
                  }
                >
                  <Archive aria-hidden="true" /> Archive environment
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="grid gap-x-6 gap-y-2.5 border-t border-border px-[18px] py-3.5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <dl className="space-y-2">
          <AddressRow label="Convex deployment" value={environment.deploymentOrigin} />
          <AddressRow label="Management (site) URL" value={environment.managementOrigin} />
          <AddressRow label="Public website" value={environment.siteOrigin} link />
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <dt className="w-[150px] shrink-0">Portable key</dt>
            <dd className="truncate font-mono">{environment.instanceKey}</dd>
          </div>
        </dl>
        <dl className="grid grid-cols-3 gap-2 self-start text-[12px]">
          <VersionCell label="Contract" value={environment.siteContractVersion} />
          <VersionCell label="Schema" value={environment.schemaVersion} />
          <VersionCell label="Engine" value={environment.engineVersion} />
        </dl>
      </div>

      <footer
        aria-label="Controller authority"
        className="flex flex-wrap items-center gap-3 rounded-b-xl border-t border-border bg-surface-2/70 px-[18px] py-3"
      >
        {activeConnection ? (
          <>
            <span className="grid size-8 place-items-center rounded-lg bg-success-soft text-success">
              <KeyRound aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-foreground">
                {activeConnection.status === "connected" ? "Connected" : "Connection needs attention"} · {activeConnection.name}
              </span>
              <span className="block truncate text-[12px] text-muted-foreground">
                {activeConnection.accountLabel ? `${activeConnection.accountLabel} · ` : ""}
                encrypted envelope v{activeConnection.credentialVersion ?? "?"}
                {lastCheck
                  ? ` · last check ${lastCheck.status}${lastCheck.latencyMs !== null ? ` in ${lastCheck.latencyMs} ms` : ""} at ${new Date(lastCheck.checkedAt).toLocaleString()}`
                  : ""}
              </span>
            </span>
            <div className="flex items-center gap-2" role="group" aria-label={`Controller connection ${activeConnection.name}`}>
              <Button
                size="sm"
                variant="outline"
                disabled={!canManageConnection || busy}
                onClick={() =>
                  void api.run(
                    `test-${activeConnection.connectionId}`,
                    () => testConnection({ connectionId: activeConnection.connectionId }),
                    "Connection health verified.",
                  )
                }
              >
                {api.pending === `test-${activeConnection.connectionId}` ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
                ) : (
                  <Activity data-icon="inline-start" aria-hidden="true" />
                )}
                Test
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!canManageConnection || busy}
                onClick={() =>
                  void api.run(
                    `rotate-${activeConnection.connectionId}`,
                    () => rotateConnection({ connectionId: activeConnection.connectionId }),
                    "Controller signing authority rotated.",
                  )
                }
              >
                {api.pending === `rotate-${activeConnection.connectionId}` ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw data-icon="inline-start" aria-hidden="true" />
                )}
                Rotate
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-live-soft"
                disabled={!canManageConnection || busy}
                onClick={() =>
                  api.openDialog({
                    kind: "confirm",
                    request: {
                      title: "Revoke controller authority",
                      description:
                        "This controller loses the ability to manage the environment until a new connection is created. If this is a client handoff, confirm the other controller works first.",
                      phrase: expectedConnectionRevocation(String(activeConnection.connectionId)),
                      ariaLabel: "Connection revocation confirmation",
                      confirmLabel: "Revoke authority",
                      onConfirm: async () => {
                        try {
                          await revokeConnection({ connectionId: activeConnection.connectionId });
                          return "Controller authority revoked.";
                        } catch (cause) {
                          const message = cause instanceof Error ? cause.message : String(cause);
                          if (!/could not be reached|force-revoke/i.test(message)) throw cause;
                          const force = window.confirm(
                            "The site could not be reached to revoke the controller authority (deleted or offline deployment?). Clear the stored credential anyway?",
                          );
                          if (!force) return "";
                          await revokeConnection({ connectionId: activeConnection.connectionId, force: true });
                          return "Stored credential cleared. The site itself could not be reached.";
                        }
                      },
                    },
                  })
                }
              >
                <Trash2 data-icon="inline-start" aria-hidden="true" />
                Revoke
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="grid size-8 place-items-center rounded-lg bg-warning-soft text-warning">
              <KeyRound aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-foreground">Not connected</span>
              <span className="block text-[12px] text-muted-foreground">
                {connections.length > 0
                  ? "A previous connection exists but has no usable credential."
                  : "This controller has no authority over the deployment yet."}
              </span>
            </span>
            {access.loading ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
            ) : canManageConnection ? (
              <Button
                size="sm"
                onClick={() => api.openDialog({ kind: "connect", websiteId, environment: treeEnvironment })}
              >
                <KeyRound data-icon="inline-start" aria-hidden="true" />
                Connect
              </Button>
            ) : (
              <span className="text-[12px] text-muted-foreground">Your role cannot grant authority.</span>
            )}
          </>
        )}
      </footer>
      <WebsitePublishingPanel organizationId={organizationId} businessId={businessId} websiteId={websiteId} instanceId={instanceId} kind={environment.kind} siteOrigin={environment.siteOrigin} />
    </article>
  );
}

function kindTitle(kind: string) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function AddressRow({ label, value, link }: { label: string; value: string; link?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <dt className="w-[150px] shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-1.5">
        {link ? (
          <a href={value} target="_blank" rel="noreferrer" className="truncate font-mono text-ink-2 hover:text-primary">
            {value}
          </a>
        ) : (
          <span className="truncate font-mono text-ink-2">{value}</span>
        )}
        <button
          type="button"
          aria-label={`Copy ${label}`}
          onClick={() => void copy()}
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check aria-hidden="true" className="size-3.5 text-success" /> : <Copy aria-hidden="true" className="size-3.5" />}
        </button>
      </dd>
    </div>
  );
}

function VersionCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/60 px-2.5 py-2">
      <dt className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-[12px] text-foreground">{value ?? "—"}</dd>
    </div>
  );
}

export type { EnvironmentDetail };
export const environmentIdOf = (environment: EnvironmentDetail) =>
  environment.instanceId as Id<"overseer_websiteInstances">;
