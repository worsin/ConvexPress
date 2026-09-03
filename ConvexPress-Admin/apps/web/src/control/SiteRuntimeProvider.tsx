import { SiteClientManager, type SiteClientTarget } from "@convexpress/runtime-clients";
import { ConvexProviderWithAuth } from "convex/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
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
  children: ReactNode;
}

export function SiteRuntimeProvider({
  target,
  exchangeSession,
  operator,
  onSignOut,
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
  const targetKey = target
    ? `${target.connectionId}|${target.instanceKey}|${target.deploymentOrigin}`
    : "none";

  useEffect(() => {
    if (!target) {
      manager.clear();
      return;
    }
    void manager.select(target, async () => exchangeSession(target));
  }, [exchangeSession, manager, retryVersion, target, targetKey]);

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

  if (!target) {
    return (
      <RuntimeState
        title="Choose a website environment"
        detail="Select an organization, business, website, and environment to open its isolated ConvexPress admin."
      />
    );
  }
  if (snapshot.status === "switching" || snapshot.status === "idle") {
    return (
      <RuntimeState
        busy
        title="Opening isolated site"
        detail={`Exchanging a short-lived session for ${target.instanceKey}.`}
      />
    );
  }
  if (snapshot.status === "error" || !snapshot.client) {
    return (
      <RuntimeState
        danger
        title="Site session unavailable"
        detail="The selected environment stayed isolated. No previous site's data was reused."
        action={
          <Button onClick={() => setRetryVersion((value) => value + 1)}>
            <RefreshCw className="mr-2 size-4" /> Retry
          </Button>
        }
      />
    );
  }

  return (
    <ConvexProviderWithAuth client={snapshot.client} useAuth={useSiteAuth}>
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
  action,
}: {
  title: string;
  detail: string;
  busy?: boolean;
  danger?: boolean;
  action?: ReactNode;
}) {
  const Icon = busy ? Loader2 : danger ? AlertTriangle : null;
  return (
    <main className="grid h-full min-h-0 place-items-center overflow-auto bg-[#f4f5f7] p-6 text-slate-950">
      <section className="max-w-lg border border-slate-300 bg-white p-8 shadow-[0_18px_55px_rgba(15,23,42,0.09)]">
        {Icon ? (
          <Icon
            aria-hidden="true"
            className={`mb-5 size-7 ${busy ? "animate-spin text-blue-700" : "text-amber-700"}`}
          />
        ) : null}
        <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">{detail}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </section>
    </main>
  );
}
