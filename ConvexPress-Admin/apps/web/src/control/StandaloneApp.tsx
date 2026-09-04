import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import type { AnyRouter } from "@tanstack/react-router";
import { RouterProvider } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { BrandMark } from "@/components/brand/BrandMark";
import type { ControlAuthClient } from "./auth-client";
import { signOutControlOperator } from "./auth-client";
import {
  ControlShellProvider,
  type ControlPanel,
  type ControlShellValue,
} from "./ControlShellContext";
import { OperatorLogin } from "./OperatorLogin";
import { SiteRuntimeProvider } from "./SiteRuntimeProvider";
import { HandoffPanel } from "./components/HandoffPanel";
import { LifecyclePanel } from "./components/LifecyclePanel";
import type { ScopeSelection } from "./components/ScopeSwitcher";
import { StandaloneFrame } from "./components/StandaloneFrame";
import { SitesWorkspace } from "./sites/SitesWorkspace";
import type { SitesNode } from "./sites/sites-model";
import { controlSurfaceVisibility } from "./components/site-manager-view";
import { siteSessionRole } from "./site-session-role";

export function StandaloneApp({
  authClient,
  router,
}: {
  authClient: ControlAuthClient;
  router: AnyRouter;
}) {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <StartupState label="Restoring protected operator session" />;
  if (!session) return <OperatorLogin authClient={authClient} />;
  return <ControlPlaneShell authClient={authClient} router={router} />;
}

function ControlPlaneShell({
  authClient,
  router,
}: {
  authClient: ControlAuthClient;
  router: AnyRouter;
}) {
  const context = useQuery(controlApi.context.get, {});
  const operator = useQuery(controlApi.operators.current, {});
  const setActive = useMutation(controlApi.context.setActive);
  const exchange = useAction(controlApi.siteBroker.session.exchange);
  const [pendingSelection, setPendingSelection] = useState<ScopeSelection | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<ControlPanel | null>(null);
  const [sitesNode, setSitesNode] = useState<SitesNode | null>(null);
  const [siteRuntimeRevision, setSiteRuntimeRevision] = useState(0);
  const switchGeneration = useRef(0);
  const managerOpen = openPanel === "sites";

  const serverSelection: ScopeSelection = context?.active ?? {
    organizationId: null,
    businessId: null,
    websiteId: null,
    instanceId: null,
  };
  const selection = pendingSelection ?? serverSelection;
  const selectedEnvironment =
    context?.environments.find(
      (entry) => String(entry.instanceId) === selection.instanceId,
    ) ?? null;
  const websiteEnvironments = useMemo(() => {
    const websiteId = selectedEnvironment?.websiteId ?? selection.websiteId;
    if (!websiteId || !context) return [];
    return context.environments.filter(
      (entry) => String(entry.websiteId) === String(websiteId),
    );
  }, [context, selectedEnvironment, selection.websiteId]);
  const selectedWebsite = selection.websiteId
    ? context?.websites.find(
        (entry) => String(entry.websiteId) === selection.websiteId,
      ) ?? null
    : null;
  const selectedBusiness = selection.businessId
    ? context?.businesses.find(
        (entry) => String(entry.businessId) === selection.businessId,
      ) ?? null
    : null;
  const selectedOrganization = selection.organizationId
    ? context?.organizations.find(
        (entry) => String(entry.organizationId) === selection.organizationId,
      ) ?? null
    : null;
  const connections = useQuery(
    controlApi.connections.queries.listForInstance,
    !managerOpen && selectedEnvironment
      ? { instanceId: selectedEnvironment.instanceId }
      : "skip",
  );
  const activeConnection = connections?.find(
    (connection) =>
      connection.status === "connected" &&
      connection.isActive &&
      connection.hasCredentials,
  );
  const liveEnvironment = websiteEnvironments.find(
    (environment) => environment.kind === "live",
  );
  // Shell-level capability checks travel in ONE subscription; constrained
  // backends cap concurrent query executions and a burst of tiny checks on
  // reconnect keeps the socket cycling.
  const shellChecks = useMemo(() => {
    if (managerOpen || !selectedBusiness) return [];
    const business = {
      organizationId: String(selectedBusiness.organizationId),
      businessId: String(selectedBusiness.businessId),
    };
    const checks: Array<{
      key: "backup" | "handoffExport" | "handoffImport" | "liveOperate";
      selectorType: "capability";
      code: string;
      organizationId: string;
      businessId: string;
      websiteId?: string;
      instanceId?: string;
    }> = [];
    if (selectedEnvironment && selectedWebsite) {
      const environment = {
        ...business,
        websiteId: String(selectedWebsite.websiteId),
        instanceId: String(selectedEnvironment.instanceId),
      };
      checks.push({ key: "backup", selectorType: "capability", code: "site.backup.create", ...environment });
      checks.push({ key: "handoffExport", selectorType: "capability", code: "site.handoff.export", ...environment });
    }
    checks.push({ key: "handoffImport", selectorType: "capability", code: "business.update", ...business });
    if (liveEnvironment && selectedWebsite) {
      checks.push({
        key: "liveOperate",
        selectorType: "capability",
        code: "environment.live.operate",
        ...business,
        websiteId: String(selectedWebsite.websiteId),
        instanceId: String(liveEnvironment.instanceId),
      });
    }
    return checks;
  }, [managerOpen, selectedBusiness, selectedEnvironment, selectedWebsite, liveEnvironment]);
  const shellDecisions = useQuery(
    controlApi.rbac.queries.checkManyAccess,
    shellChecks.length > 0
      ? { checks: shellChecks.map(({ key: _key, ...check }) => check) }
      : "skip",
  );
  const decisionFor = (key: (typeof shellChecks)[number]["key"]) => {
    const index = shellChecks.findIndex((check) => check.key === key);
    return index === -1 ? undefined : shellDecisions?.[index];
  };
  const lifecycleAccess = decisionFor("backup");
  const handoffExportAccess = decisionFor("handoffExport");
  const handoffImportAccess = decisionFor("handoffImport");
  const liveOperateAccess = decisionFor("liveOperate");
  const controlVisibility = controlSurfaceVisibility({
    backupAllowed: lifecycleAccess?.allowed === true,
    selectedEnvironmentIsLive: selectedEnvironment?.kind === "live",
    websiteHasLiveEnvironment: Boolean(liveEnvironment),
    liveOperateAllowed:
      !liveEnvironment || liveOperateAccess?.allowed === true,
    handoffExportAllowed: handoffExportAccess?.allowed === true,
    handoffImportAllowed: handoffImportAccess?.allowed === true,
  });

  const siteRole = siteSessionRole({
    platformRole: operator?.role,
    environmentKind: selectedEnvironment?.kind,
    liveOperateAllowed: liveOperateAccess?.allowed,
  });
  const target = useMemo(() => {
    if (
      !selectedEnvironment ||
      !activeConnection ||
      !siteRole ||
      selectedEnvironment.compatibility === "incompatible"
    ) {
      return null;
    }
    return {
      connectionId: String(activeConnection.connectionId),
      instanceKey: selectedEnvironment.instanceKey,
      deploymentOrigin: selectedEnvironment.deploymentOrigin,
      siteOrigin: selectedEnvironment.siteOrigin,
    };
  }, [activeConnection, selectedEnvironment, siteRole]);

  const exchangeSession = useCallback(
    async (requestedTarget: NonNullable<typeof target>) => {
      if (!siteRole) throw new Error("Site session authorization is still loading");
      const result = await exchange({
        connectionId: requestedTarget.connectionId as Id<"overseer_connections">,
        requestedCapabilities: ["health.read", "compatibility.read"],
        requestedSiteRole: siteRole,
      });
      if (result.instanceKey !== requestedTarget.instanceKey) {
        throw new Error("Selected site identity changed during session exchange");
      }
      return { token: result.token, expiresAt: result.expiresAt };
    },
    [exchange, siteRole],
  );

  const changeScope = useCallback(
    (next: ScopeSelection) => {
      const generation = ++switchGeneration.current;
      setScopeError(null);
      setPendingSelection(next);
      void setActive({
        organizationId: next.organizationId as Id<"overseer_organizations"> | null,
        businessId: next.businessId as Id<"overseer_businesses"> | null,
        websiteId: next.websiteId as Id<"overseer_websites"> | null,
        instanceId: next.instanceId as Id<"overseer_websiteInstances"> | null,
      })
        .then(() => {
          if (switchGeneration.current === generation) setPendingSelection(null);
        })
        .catch(() => {
          if (switchGeneration.current !== generation) return;
          setPendingSelection(null);
          setScopeError("The selected scope is no longer available to this operator.");
        });
    },
    [setActive],
  );

  const selectWebsite = useCallback(
    (websiteId: string) => {
      if (!context) return;
      const website = context.websites.find(
        (entry) => String(entry.websiteId) === websiteId,
      );
      if (!website) return;
      const candidates = context.environments.filter(
        (entry) => String(entry.websiteId) === websiteId,
      );
      const environment =
        candidates.find((entry) => entry.isDefault) ?? candidates[0] ?? null;
      changeScope({
        organizationId: String(website.organizationId),
        businessId: String(website.businessId),
        websiteId,
        instanceId: environment ? String(environment.instanceId) : null,
      });
    },
    [changeScope, context],
  );

  const selectBusiness = useCallback(
    (businessId: string) => {
      if (!context) return;
      const business = context.businesses.find(
        (entry) => String(entry.businessId) === businessId,
      );
      if (!business) return;
      changeScope({
        organizationId: String(business.organizationId),
        businessId,
        websiteId: null,
        instanceId: null,
      });
    },
    [changeScope, context],
  );

  const selectEnvironment = useCallback(
    (instanceId: string) => {
      changeScope({ ...selection, instanceId });
    },
    [changeScope, selection],
  );

  const signOut = useCallback(async () => {
    await signOutControlOperator(authClient);
  }, [authClient]);
  const openSites = useCallback((node?: SitesNode) => {
    setSitesNode(node ?? null);
    setOpenPanel("sites");
  }, []);
  const getControlToken = useCallback(async () => {
    const result = await authClient.convex.token({ fetchOptions: { throw: false } });
    return result.data?.token ?? null;
  }, [authClient]);
  const refreshSiteRuntime = useCallback(() => {
    setSiteRuntimeRevision((revision) => revision + 1);
  }, []);

  if (!context || !operator) return <StartupState label="Loading authorized websites" />;

  const operatorIdentity = {
    id: String(operator.userId),
    email: operator.email ?? "operator@convexpress.local",
    displayName: operator.name ?? operator.email ?? "ConvexPress Operator",
    role: operator.role,
  };

  const connectionState: ControlShellValue["connectionState"] = !selectedEnvironment
    ? "none"
    : connections === undefined
      ? "loading"
      : activeConnection
        ? "connected"
        : "missing";

  const shellValue: ControlShellValue = {
    context,
    selection,
    pending: pendingSelection !== null,
    scopeError,
    selectedOrganization,
    selectedBusiness,
    selectedWebsite,
    selectedEnvironment,
    websiteEnvironments,
    connectionState,
    operator: operatorIdentity,
    changeScope,
    selectWebsite,
    selectBusiness,
    selectEnvironment,
    signOut,
    openPanel,
    setOpenPanel,
    sitesNode,
    openSites,
    getControlToken,
    visibility: {
      operations: controlVisibility.operations,
      handoff: controlVisibility.handoff,
      handoffExport: controlVisibility.handoffExport,
      handoffImport: controlVisibility.handoffImport,
    },
  };

  return (
    <ControlShellProvider value={shellValue}>
      <div className="relative flex h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground">
        <ShellNotices
          scopeError={scopeError}
          missingConnection={connectionState === "missing"}
          onDismissScopeError={() => setScopeError(null)}
        />
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <SiteRuntimeProvider
            target={target}
            resolving={Boolean(
              selectedEnvironment &&
                activeConnection &&
                !siteRole &&
                selectedEnvironment.compatibility !== "incompatible",
            )}
            exchangeSession={exchangeSession}
            operator={operatorIdentity}
            onSignOut={signOut}
            runtimeRevision={siteRuntimeRevision}
            renderState={(state) => <StandaloneFrame>{state}</StandaloneFrame>}
          >
            <RouterProvider router={router} />
          </SiteRuntimeProvider>
          <LifecyclePanel
            open={openPanel === "operations"}
            environments={websiteEnvironments.map((environment) => ({
              instanceId: environment.instanceId,
              instanceKey: environment.instanceKey,
              kind: environment.kind,
              label: environment.label,
            }))}
            instance={
              selectedEnvironment
                ? {
                    instanceId: selectedEnvironment.instanceId,
                    instanceKey: selectedEnvironment.instanceKey,
                    kind: selectedEnvironment.kind,
                    label: selectedEnvironment.label,
                  }
                : null
            }
            onClose={() => setOpenPanel(null)}
            onEnvironmentReplaced={refreshSiteRuntime}
          />
          <HandoffPanel
            open={openPanel === "handoff"}
            source={
              selectedEnvironment && selectedWebsite
                ? {
                    websiteId: selectedWebsite.websiteId,
                    websiteKey: selectedWebsite.websiteKey,
                    websiteTitle: selectedWebsite.title,
                    instanceId: selectedEnvironment.instanceId,
                  }
                : null
            }
            destination={
              selectedBusiness
                ? {
                    organizationId: selectedBusiness.organizationId,
                    businessId: selectedBusiness.businessId,
                    businessName: selectedBusiness.name,
                  }
                : null
            }
            canExport={controlVisibility.handoffExport}
            canImport={controlVisibility.handoffImport}
            onClose={() => setOpenPanel(null)}
          />
          {managerOpen ? (
            <div className="absolute inset-0 z-[45]">
              <StandaloneFrame layout="fill">
                <SitesWorkspace />
              </StandaloneFrame>
            </div>
          ) : null}
        </div>
      </div>
    </ControlShellProvider>
  );
}

function ShellNotices({
  scopeError,
  missingConnection,
  onDismissScopeError,
}: {
  scopeError: string | null;
  missingConnection: boolean;
  onDismissScopeError: () => void;
}) {
  if (!scopeError && !missingConnection) return null;
  return (
    <div className="pointer-events-none absolute right-4 top-[60px] z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
      {scopeError ? (
        <p
          role="alert"
          className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-card px-3.5 py-3 text-[13px] leading-5 text-foreground shadow-float"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span className="flex-1">{scopeError}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismissScopeError}
            className="-mr-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </p>
      ) : null}
      {missingConnection ? (
        <p
          role="alert"
          className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning-soft px-3.5 py-3 text-[13px] leading-5 text-foreground shadow-float"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>This environment has no active management connection.</span>
        </p>
      ) : null}
    </div>
  );
}

function StartupState({ label }: { label: string }) {
  return (
    <div className="grid min-h-svh place-items-center bg-background text-foreground">
      <div className="flex flex-col items-center text-center">
        <BrandMark size={44} />
        <Loader2 className="mt-6 size-5 animate-spin text-primary" aria-hidden="true" />
        <p className="mt-3 text-[13px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
