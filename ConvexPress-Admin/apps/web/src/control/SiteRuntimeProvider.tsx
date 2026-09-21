import {
  SiteClientManager,
  type SiteClientSnapshot,
  type SiteClientTarget,
} from "@convexpress/runtime-clients";
import { ConvexProviderWithAuth } from "convex/react";

import { getElectronBridge } from "@/lib/electron";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache";
import { AlertTriangle, Globe2, Loader2, RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  createContext,
  useContext,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { LocalAuthProvider } from "@/lib/local-auth-context";
import { createSiteSessionRecovery } from "./site-session-recovery";
import { siteRuntimeNetworkOrigins } from "./siteRuntimeNetworkOrigins";
import { prepareSiteNetwork } from "./siteNetworkPreparation";
import { EditorRecoveryProvider } from "@/components/blocks/canonical-editor/EditorRecoveryProvider";

export interface SelectedSiteTarget extends SiteClientTarget {
  siteOrigin: string;
  websiteKey?: string;
  /** Current broker-selected role identity: invalidates the client, never grants a role. */
  sessionRoleKey?: string;
}

/** Display/routing context only. It conveys no token or additional authority. */
export interface VerifiedSiteRuntime {
  target: Readonly<SelectedSiteTarget>;
  generation: string;
  operatorId: string;
  recoverSession(manual?: boolean): boolean;
  markSessionHealthy(): void;
}
const VerifiedSiteRuntimeContext = createContext<VerifiedSiteRuntime | null>(null);
export const useVerifiedSiteRuntime = () => useContext(VerifiedSiteRuntimeContext);

export function siteRuntimeSelectionKey(target: SelectedSiteTarget | null, operatorId: string, revision: number, retry: number): string {
  return JSON.stringify([target?.connectionId, target?.websiteKey, target?.instanceKey, target?.deploymentOrigin, target?.siteOrigin, target?.sessionRoleKey, operatorId, revision, retry]);
}

interface SiteRuntimeProviderProps {
  target: SelectedSiteTarget | null;
  exchangeSession: (target: SelectedSiteTarget) => Promise<{
    token: string;
    expiresAt: number;
  }>;
  operator: { id: string; email: string; displayName: string };
  onSignOut: () => Promise<void>;
  runtimeRevision?: number;
  /**
   * True while an environment is selected but its session role / connection
   * is still being resolved, so the shell shows progress instead of the
   * "choose an environment" prompt.
   */
  resolving?: boolean;
  /**
   * Wraps the idle / switching / error states so they render inside the same
   * shell chrome as the site admin. Defaults to a bare centered layout.
   */
  renderState?: (state: ReactNode) => ReactNode;
  children: ReactNode;
}

export function isSiteRuntimeSwitching(
  target: SelectedSiteTarget | null,
  snapshot: Pick<SiteClientSnapshot<unknown>, "status" | "instanceKey">,
) {
  if (!target) return false;
  return (
    snapshot.status === "idle" ||
    snapshot.status === "switching" ||
    snapshot.instanceKey !== target.instanceKey
  );
}

export function SiteRuntimeProvider(props: SiteRuntimeProviderProps) {
  const scope = siteRuntimeSelectionKey(props.target, props.operator.id, 0, 0);
  return <EditorRecoveryProvider scope={scope}><SiteRuntimeSession {...props} /></EditorRecoveryProvider>;
}

function SiteRuntimeSession({
  target,
  exchangeSession,
  operator,
  onSignOut,
  runtimeRevision = 0,
  resolving = false,
  renderState,
  children,
}: SiteRuntimeProviderProps) {
  const managerRef = useRef<SiteClientManager | null>(null);
  if (!managerRef.current) managerRef.current = new SiteClientManager();
  const manager = managerRef.current;
  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
  const [retryVersion, setRetryVersion] = useState(0);
  const [selectedRequestKey, setSelectedRequestKey] = useState<string | null>(null);
  const recoveryRef = useRef(createSiteSessionRecovery());
  // The database and its public website usually have different origins. The
  // document policy must admit both the backend connection and the live preview.
  const networkOriginsKey = JSON.stringify(siteRuntimeNetworkOrigins(target));
  const networkRequestKey = JSON.stringify([networkOriginsKey, retryVersion]);
  const [networkState, setNetworkState] = useState<{key:string; status:'ready'|'reload'|'error'} | null>(null);
  const networkReady = networkState?.key === networkRequestKey && networkState.status === 'ready';
  useEffect(() => {
    const origins: string[] = JSON.parse(networkOriginsKey);
    const bridge = getElectronBridge();
    if (!origins.length || !bridge?.security) {
      setNetworkState({key:networkRequestKey,status:'ready'});
      return;
    }
    let cancelled = false;
    void prepareSiteNetwork(origins, bridge.security.registerDeploymentOrigins)
      .then((reloadRequired) => {
        if (cancelled) return;
        setNetworkState({key:networkRequestKey,status:reloadRequired ? 'reload' : 'ready'});
        if (reloadRequired) window.location.reload();
      })
      .catch(() => { if (!cancelled) setNetworkState({key:networkRequestKey,status:'error'}); });
    return () => {
      cancelled = true;
    };
  }, [networkOriginsKey, networkRequestKey]);
  const targetKey = target
    ? `${target.connectionId}|${target.instanceKey}|${target.deploymentOrigin}`
    : "none";
  const requestKey = siteRuntimeSelectionKey(target, operator.id, runtimeRevision, retryVersion);
  const recoveryKey = siteRuntimeSelectionKey(target, operator.id, runtimeRevision, 0);

  useEffect(() => {
    if (!target || !networkReady) {
      manager.clear();
      setSelectedRequestKey(null);
      return;
    }
    setSelectedRequestKey(requestKey);
    void manager.select(
      target,
      async () => exchangeSession(target),
      requestKey,
    );
  }, [exchangeSession, manager, requestKey, target, networkReady]);

  useEffect(() => () => manager.clear(), [manager]);

  const useSiteAuth = useCallback(
    () => ({
      isLoading: snapshot.status === "switching",
      isAuthenticated: snapshot.status === "ready",
      fetchAccessToken: manager.fetchAccessToken,
    }),
    [manager, snapshot.status],
  );

  const localAuthValue = useMemo(
    () => ({
      isLoading: false,
      isAuthenticated: snapshot.status === "ready",
      user: operator,
      login: async () => {
        throw new Error("Use the ConvexPress operator sign-in.");
      },
      logout: onSignOut,
    }),
    [onSignOut, operator, snapshot.status],
  );
  const verifiedRuntime = useMemo<VerifiedSiteRuntime | null>(() => {
    if (!target || !networkReady || !snapshot.client || snapshot.status !== "ready" || selectedRequestKey !== requestKey) return null;
    return {
      target: Object.freeze({ ...target }), operatorId: operator.id, generation: crypto.randomUUID(),
      recoverSession: (manual=false) => recoveryRef.current.request(recoveryKey,()=>setRetryVersion(value=>value+1),manual),
      markSessionHealthy:()=>recoveryRef.current.healthy(recoveryKey),
    };
  }, [targetKey, target?.siteOrigin, snapshot.client, snapshot.status, selectedRequestKey, requestKey, operator.id, networkReady]);

  const frame = renderState ?? ((state: ReactNode) => (
    <main className="grid h-full min-h-0 place-items-center overflow-auto bg-background p-6">
      {state}
    </main>
  ));

  if (!target && resolving) {
    return frame(
      <RuntimeState
        busy
        title="Opening isolated site"
        detail="Checking your access to this environment."
      />,
    );
  }
  if (!target) {
    return frame(
      <RuntimeState
        icon={<Globe2 aria-hidden="true" className="size-5 text-primary" />}
        title="Choose a website environment"
        detail="Select an organization, business, website, and environment to open its isolated ConvexPress admin."
      />,
    );
  }
  if (!networkReady) {
    const status = networkState?.key === networkRequestKey ? networkState.status : null;
    return frame(<RuntimeState busy={status === null} danger={status === 'error'}
      title={status === 'error' ? 'Unable to open this environment' : 'Opening isolated site'}
      detail={status === 'error' ? 'The secure connection could not be prepared. Try again.' : 'Preparing the secure connection to this environment.'}
      action={status === 'error' ? <Button variant="outline" onClick={()=>setRetryVersion(value=>value+1)}>Try again</Button>
        : status === 'reload' ? <Button onClick={()=>window.location.reload()}>Continue opening</Button> : undefined}
    />);
  }
  if (isSiteRuntimeSwitching(target, snapshot) || selectedRequestKey !== requestKey) {
    return frame(
      <RuntimeState
        busy
        title="Opening isolated site"
        detail={`Exchanging a short-lived session for ${target.instanceKey}.`}
      />,
    );
  }
  if (snapshot.status === "error" || !snapshot.client) {
    return frame(
      <RuntimeState
        danger
        title="Site session unavailable"
        detail="The selected environment stayed isolated. No previous site's data was reused."
        action={
          <Button variant="outline" onClick={() => setRetryVersion((value) => value + 1)}>
            <RefreshCw data-icon="inline-start" /> Retry
          </Button>
        }
      />,
    );
  }

  return (
    <ConvexProviderWithAuth
      client={snapshot.client}
      key={snapshot.instanceKey}
      useAuth={useSiteAuth}
    >
      <ConvexQueryCacheProvider expiration={300_000} maxIdleEntries={250}>
        <VerifiedSiteRuntimeContext.Provider value={verifiedRuntime}>
          <LocalAuthProvider value={localAuthValue}>{children}</LocalAuthProvider>
        </VerifiedSiteRuntimeContext.Provider>
      </ConvexQueryCacheProvider>
    </ConvexProviderWithAuth>
  );
}

function RuntimeState({
  title,
  detail,
  busy = false,
  danger = false,
  icon,
  action,
}: {
  title: string;
  detail: string;
  busy?: boolean;
  danger?: boolean;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      aria-busy={busy || undefined}
      className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-soft"
    >
      <span
        className={`grid size-10 place-items-center rounded-xl ${
          danger ? "bg-live-soft" : "bg-primary-soft"
        }`}
      >
        {busy ? (
          <Loader2 aria-hidden="true" className="size-5 animate-spin text-primary" />
        ) : danger ? (
          <AlertTriangle aria-hidden="true" className="size-5 text-destructive" />
        ) : (
          icon
        )}
      </span>
      <h1 className="mt-5 font-serif text-[30px] leading-none tracking-[-0.01em]">{title}</h1>
      <p className="mt-3 max-w-sm text-[13.5px] leading-6 text-ink-2">{detail}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
