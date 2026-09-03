/**
 * Sites workspace.
 *
 * One place to see and manage everything this operator controls: a
 * searchable portfolio tree on the left (organization › business › website ›
 * environment) and a page for the selected node on the right. Registering a
 * new website is a guided flow that ends with a wired, isolated deployment.
 */

import { ArrowLeft, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useControlShell } from "@/control/ControlShellContext";
import { cn } from "@/lib/utils";
import { PortfolioTree } from "./PortfolioTree";
import { AddWebsiteDialog } from "./dialogs/AddWebsiteDialog";
import { AttachEnvironmentDialog } from "./dialogs/AttachEnvironmentDialog";
import { ConfirmDialog, type ConfirmRequest } from "./dialogs/ConfirmDialog";
import { ConnectAuthorityDialog } from "./dialogs/ConnectAuthorityDialog";
import { InviteOperatorDialog } from "./dialogs/InviteOperatorDialog";
import {
  BusinessDialog,
  EnvironmentDialog,
  OrganizationDialog,
  WebsiteDialog,
} from "./dialogs/RecordDialogs";
import { Notice } from "./forms";
import { BusinessPage } from "./pages/BusinessPage";
import { OrganizationPage } from "./pages/OrganizationPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PeoplePage } from "./pages/PeoplePage";
import { WebsitePage } from "./pages/WebsitePage";
import {
  buildPortfolioTree,
  countPortfolio,
  filterPortfolioTree,
  findBusiness,
  findWebsite,
  nodeForSelection,
  sameNode,
  type SitesNode,
  type TreeEnvironment,
  type TreeOrganization,
} from "./sites-model";
import { useWorkspaceActions } from "./useWorkspaceActions";

export type SitesDialog =
  | { kind: "add-website"; organizationId?: string; businessId?: string }
  | { kind: "new-organization" }
  | { kind: "edit-organization"; organizationId: string }
  | { kind: "new-business"; organizationId?: string }
  | { kind: "edit-business"; businessId: string }
  | { kind: "edit-website"; websiteId: string }
  | { kind: "attach-environment"; websiteId: string }
  | { kind: "edit-environment"; environment: TreeEnvironment; websiteId: string }
  | { kind: "connect"; environment: TreeEnvironment; websiteId: string }
  | { kind: "invite"; organizationId?: string; businessId?: string; websiteId?: string }
  | { kind: "confirm"; request: ConfirmRequest };

export interface WorkspaceApi {
  tree: TreeOrganization[];
  node: SitesNode;
  select: (node: SitesNode) => void;
  openDialog: (dialog: SitesDialog) => void;
  closeDialog: () => void;
  pending: string | null;
  run: ReturnType<typeof useWorkspaceActions>["run"];
  /** Switch the shell to this website/environment and leave the workspace. */
  openInShell: (websiteId: string, instanceId?: string | null) => void;
  openOperations: (websiteId: string, instanceId: string) => void;
  openTransfer: (businessId: string, websiteId?: string, instanceId?: string) => void;
  close: () => void;
}

export function SitesWorkspace() {
  const shell = useControlShell();
  if (!shell) return null;
  return <Workspace shellKey={shell.operator.id} />;
}

function Workspace({ shellKey }: { shellKey: string }) {
  const shell = useControlShell()!;
  const [query, setQuery] = useState("");
  const [node, setNode] = useState<SitesNode>(
    () => shell.sitesNode ?? nodeForSelection(shell.selection),
  );
  const [dialog, setDialog] = useState<SitesDialog | null>(null);
  const { pending, notice, run, clearNotice } = useWorkspaceActions();

  useEffect(() => {
    if (shell.sitesNode) setNode(shell.sitesNode);
  }, [shell.sitesNode]);

  const tree = useMemo(
    () =>
      buildPortfolioTree({
        organizations: shell.context.organizations.map((o) => ({
          organizationId: String(o.organizationId),
          name: o.name,
          slug: o.slug,
        })),
        businesses: shell.context.businesses.map((b) => ({
          businessId: String(b.businessId),
          organizationId: String(b.organizationId),
          name: b.name,
          slug: b.slug,
        })),
        websites: shell.context.websites.map((w) => ({
          websiteId: String(w.websiteId),
          businessId: String(w.businessId),
          organizationId: String(w.organizationId),
          websiteKey: w.websiteKey,
          title: w.title,
          primaryDomain: w.primaryDomain,
          isDefault: w.isDefault,
        })),
        environments: shell.context.environments.map((e) => ({
          instanceId: String(e.instanceId),
          websiteId: String(e.websiteId),
          instanceKey: e.instanceKey,
          kind: e.kind,
          label: e.label,
          deploymentOrigin: e.deploymentOrigin,
          managementOrigin: e.managementOrigin,
          siteOrigin: e.siteOrigin,
          health: e.health,
          compatibility: e.compatibility,
          isDefault: e.isDefault,
        })),
      }),
    [shell.context],
  );
  const filtered = useMemo(() => filterPortfolioTree(tree, query), [tree, query]);
  const counts = useMemo(() => countPortfolio(tree), [tree]);

  // Fall back to the overview when the selected node disappears (archived,
  // access revoked) so the page never renders stale data.
  const resolvedNode: SitesNode = useMemo(() => {
    if (node.type === "website" && !findWebsite(tree, node.id)) return { type: "overview" };
    if (node.type === "business" && !findBusiness(tree, node.id)) return { type: "overview" };
    if (
      node.type === "organization" &&
      !tree.some((organization) => organization.organizationId === node.id)
    ) {
      return { type: "overview" };
    }
    return node;
  }, [node, tree]);

  const close = useCallback(() => shell.setOpenPanel(null), [shell]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !dialog) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, dialog]);

  const api: WorkspaceApi = useMemo(
    () => ({
      tree,
      node: resolvedNode,
      select: (next) => {
        clearNotice();
        setNode(next);
      },
      openDialog: setDialog,
      closeDialog: () => setDialog(null),
      pending,
      run,
      openInShell: (websiteId, instanceId) => {
        const website = shell.context.websites.find((w) => String(w.websiteId) === websiteId);
        if (!website) return;
        if (instanceId) {
          shell.changeScope({
            organizationId: String(website.organizationId),
            businessId: String(website.businessId),
            websiteId,
            instanceId,
          });
        } else {
          shell.selectWebsite(websiteId);
        }
        shell.setOpenPanel(null);
      },
      openOperations: (websiteId, instanceId) => {
        const website = shell.context.websites.find((w) => String(w.websiteId) === websiteId);
        if (!website) return;
        shell.changeScope({
          organizationId: String(website.organizationId),
          businessId: String(website.businessId),
          websiteId,
          instanceId,
        });
        shell.setOpenPanel("operations");
      },
      openTransfer: (businessId, websiteId, instanceId) => {
        const business = shell.context.businesses.find((b) => String(b.businessId) === businessId);
        if (!business) return;
        if (websiteId && instanceId) {
          shell.changeScope({
            organizationId: String(business.organizationId),
            businessId,
            websiteId,
            instanceId,
          });
        } else if (String(shell.selection.businessId) !== businessId) {
          shell.selectBusiness(businessId);
        }
        shell.setOpenPanel("handoff");
      },
      close,
    }),
    [tree, resolvedNode, clearNotice, pending, run, shell, close],
  );

  const isEmpty = tree.length === 0;

  return (
    <div
      role="region"
      aria-label="Manage websites"
      className="flex h-full min-h-0 flex-col bg-background"
      data-workspace="sites"
      key={shellKey}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-6 py-3.5">
        <div className="mr-2 min-w-0">
          <p className="eyebrow">Portfolio</p>
          <h1 className="mt-0.5 font-serif text-[26px] leading-none tracking-[-0.01em]">Sites</h1>
        </div>
        <div className="relative w-full max-w-[340px] min-w-[180px] flex-1 sm:w-auto">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search sites"
            placeholder="Search by name, domain, key, or origin"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setDialog({ kind: "new-organization" })}
            className={cn(isEmpty && "hidden")}
          >
            New organization
          </Button>
          <Button onClick={() => setDialog({ kind: "add-website", ...currentScope(resolvedNode, tree) })}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Add website
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close sites"
            title="Back to the site (Esc)"
            onClick={close}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>

      {notice && (
        <div className="shrink-0 px-6 pt-3">
          <Notice tone={notice.tone}>{notice.message}</Notice>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <PortfolioTree
          tree={filtered}
          allCount={counts}
          node={resolvedNode}
          onSelect={api.select}
          onAddWebsite={(scope) => setDialog({ kind: "add-website", ...scope })}
          onNewBusiness={(organizationId) => setDialog({ kind: "new-business", organizationId })}
          filtering={query.trim().length > 0}
        />
        <section className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1080px] px-8 py-7">
            {resolvedNode.type !== "overview" && (
              <button
                type="button"
                onClick={() => api.select({ type: "overview" })}
                className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft aria-hidden="true" className="size-3.5" /> Overview
              </button>
            )}
            {resolvedNode.type === "overview" && <OverviewPage api={api} counts={counts} />}
            {resolvedNode.type === "organization" && (
              <OrganizationPage api={api} organizationId={resolvedNode.id} />
            )}
            {resolvedNode.type === "business" && (
              <BusinessPage api={api} businessId={resolvedNode.id} />
            )}
            {resolvedNode.type === "website" && (
              <WebsitePage api={api} websiteId={resolvedNode.id} />
            )}
            {resolvedNode.type === "people" && <PeoplePage api={api} />}
          </div>
        </section>
      </div>

      {dialog?.kind === "add-website" && (
        <AddWebsiteDialog
          api={api}
          organizationId={dialog.organizationId}
          businessId={dialog.businessId}
        />
      )}
      {dialog?.kind === "new-organization" && <OrganizationDialog api={api} />}
      {dialog?.kind === "edit-organization" && (
        <OrganizationDialog api={api} organizationId={dialog.organizationId} />
      )}
      {dialog?.kind === "new-business" && (
        <BusinessDialog api={api} organizationId={dialog.organizationId} />
      )}
      {dialog?.kind === "edit-business" && (
        <BusinessDialog api={api} businessId={dialog.businessId} />
      )}
      {dialog?.kind === "edit-website" && <WebsiteDialog api={api} websiteId={dialog.websiteId} />}
      {dialog?.kind === "attach-environment" && (
        <AttachEnvironmentDialog api={api} websiteId={dialog.websiteId} />
      )}
      {dialog?.kind === "edit-environment" && (
        <EnvironmentDialog
          api={api}
          websiteId={dialog.websiteId}
          environment={dialog.environment}
        />
      )}
      {dialog?.kind === "connect" && (
        <ConnectAuthorityDialog
          api={api}
          websiteId={dialog.websiteId}
          environment={dialog.environment}
        />
      )}
      {dialog?.kind === "invite" && (
        <InviteOperatorDialog
          api={api}
          organizationId={dialog.organizationId}
          businessId={dialog.businessId}
          websiteId={dialog.websiteId}
        />
      )}
      {dialog?.kind === "confirm" && <ConfirmDialog api={api} request={dialog.request} />}
    </div>
  );
}

function currentScope(node: SitesNode, tree: TreeOrganization[]) {
  if (node.type === "website") {
    const found = findWebsite(tree, node.id);
    return found
      ? { organizationId: found.organization.organizationId, businessId: found.business.businessId }
      : {};
  }
  if (node.type === "business") {
    const found = findBusiness(tree, node.id);
    return found
      ? { organizationId: found.organization.organizationId, businessId: found.business.businessId }
      : {};
  }
  if (node.type === "organization") return { organizationId: node.id };
  return {};
}

export function nodeMatches(left: SitesNode, right: SitesNode) {
  return sameNode(left, right);
}
