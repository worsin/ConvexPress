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
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { LocalAuthProvider } from "@/lib/local-auth-context";

export interface SelectedSiteTarget extends SiteClientTarget {
  siteOrigin: string;
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

export function SiteRuntimeProvider({
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
  // Desktop: the Content-Security-Policy is fixed per document, so a deployment
  // this window has never connected to must be registered with the main
  // process and the document reloaded once before its websocket and media
  // are allowed. Later launches already include it.
  const deploymentOrigin = target?.deploymentOrigin ?? null;
  useEffect(() => {
    if (!deploymentOrigin) return;
    const bridge = getElectronBridge();
    if (!bridge?.security) return;
    let cancelled = false;
    void bridge.security
      .registerDeploymentOrigins([deploymentOrigin])
      .then((result) => {
        if (cancelled || !result.added.length) return;
        const marker = `convexpress:csp-reloaded:${deploymentOrigin}`;
        if (window.sessionStorage.getItem(marker)) return;
        window.sessionStorage.setItem(marker, String(Date.now()));
        window.location.reload();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deploymentOrigin]);
  const targetKey = target
    ? `${target.connectionId}|${target.instanceKey}|${target.deploymentOrigin}`
    : "none";

  useEffect(() => {
    if (!target) {
      manager.clear();
      return;
    }
    void manager.select(
      target,
      async () => exchangeSession(target),
      `${targetKey}|retry:${retryVersion}|runtime:${runtimeRevision}`,
    );
  }, [exchangeSession, manager, retryVersion, runtimeRevision, target, targetKey]);

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
  if (isSiteRuntimeSwitching(target, snapshot)) {
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
        <LocalAuthProvider value={localAuthValue}>{children}</LocalAuthProvider>
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
