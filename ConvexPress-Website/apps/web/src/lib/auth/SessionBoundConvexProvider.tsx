import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexProviderWithAuth } from "convex/react";
import { useAuth } from "./clerk";
import { getSiteRuntime } from "../site-runtime";
import { endWebsiteOperator, exchangeOperatorCode, operatorLinkFailure, operatorNetworkFailure, OperatorNetworkError, renewWebsiteOperator, takeOperatorLaunch, type WebsiteEditingBridge, type WebsiteOperatorSession } from "./websiteOperator";
import { WebsiteOperatorContext } from "./WebsiteOperatorContext";
import { OperatorDraftContext } from "./OperatorDraftContext";
import { createOperatorDraftRecovery } from "./operatorDraftRecovery";

type Props = Omit<ComponentProps<typeof ConvexProviderWithClerk>, "useAuth">;

function OperatorProvider({ session, fetchAccessToken, ...props }: Props & { session: WebsiteOperatorSession; fetchAccessToken(args?: { forceRefreshToken: boolean }): Promise<string | null> }) {
  const value = useMemo(() => ({ isLoading: false, isAuthenticated: session.expiresAt > Date.now(), fetchAccessToken }), [session, fetchAccessToken]);
  const useOperatorAuth = useCallback(() => value, [value]);
  return <ConvexProviderWithAuth {...props} useAuth={useOperatorAuth} />;
}

/** Customer session/account changes discard the prior subtree. Same-operator
 * desktop renewal replaces only its token; authored state remains mounted. */
export function SessionBoundConvexProvider(props: Props) {
  const auth = useAuth();
  const [session, setSession] = useState<WebsiteOperatorSession | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery] = useState(createOperatorDraftRecovery);
  const desktop = useRef<WebsiteEditingBridge | null>(null);
  const owner = useRef<{ userId: string; instanceKey: string } | null>(null);
  const currentSession = useRef<WebsiteOperatorSession | null>(null);
  const renewal = useRef<Promise<WebsiteOperatorSession> | null>(null);
  const exchange = useRef<Promise<WebsiteOperatorSession> | null>(null);
  const mounted = useRef(false);
  const accept = useCallback((value: WebsiteOperatorSession | null) => {
    recovery.activate(value); currentSession.current = value; setSession(value);
  }, [recovery]);

  const reconnect = useCallback(() => {
    const bridge = desktop.current, expected = owner.current;
    if (!bridge || !expected) return Promise.resolve();
    if (renewal.current) return renewal.current.then(() => {}, () => {});
    setPending(true); setError(null);
    const attempt = renewWebsiteOperator(bridge, getSiteRuntime());
    renewal.current = attempt;
    return attempt.then(value => {
      if (!mounted.current || renewal.current !== attempt || desktop.current !== bridge) return;
      if (value.userId !== expected.userId || value.instanceKey !== expected.instanceKey) {
        accept(null); setError("The editing account changed. Open a new editing session from ConvexPress.");
        desktop.current = null; owner.current = null; void endWebsiteOperator(bridge); return;
      }
      accept(value); setError(null);
    }, () => {
      if (mounted.current && renewal.current === attempt) setError("Could not renew editing through ConvexPress. Keep the desktop app open and signed in, allow this website to connect to the local app, then reconnect. Your draft stays in this tab.");
    }).finally(() => {
      if (mounted.current && renewal.current === attempt) { renewal.current = null; setPending(false); }
    });
  }, [accept]);

  // Convex treats a new fetch callback as a new auth context and clears its
  // accepted state. Keep it stable for this operator; read the latest token
  // through the ref and join desktop renewal when Convex requests a refresh.
  const fetchOperatorToken = useCallback(async (args?: { forceRefreshToken: boolean }) => {
    if (args?.forceRefreshToken && currentSession.current && currentSession.current.expiresAt - Date.now() < 90_000) await reconnect();
    const current = currentSession.current;
    return current && current.expiresAt > Date.now() ? current.token : null;
  }, [reconnect]);

  useEffect(() => {
    mounted.current = true;
    let observing = true;
    const observe = (attempt: Promise<WebsiteOperatorSession>) => {
      setPending(true);
      void attempt.then(value => {
        if (!observing || exchange.current !== attempt) return;
        owner.current = value.userId ? { userId: value.userId, instanceKey: value.instanceKey } : null;
        accept(value);
        setError(desktop.current && !owner.current ? "Update this website's backend to enable desktop editing renewal." : null);
      }, cause => {
        if (observing && exchange.current === attempt) setError(cause instanceof OperatorNetworkError ? operatorNetworkFailure : operatorLinkFailure);
      }).finally(() => { if (observing && exchange.current === attempt) { exchange.current = null; setPending(false); } });
    };
    const receive = () => {
      try {
        const launch = takeOperatorLaunch(window.location, window.history);
        if (launch) {
          const previous = desktop.current;
          if (previous && previous.key !== launch.desktop?.key) void endWebsiteOperator(previous);
          desktop.current = launch.desktop; owner.current = null; renewal.current = null;
          accept(null); setError(null);
          exchange.current = exchangeOperatorCode(launch.code, getSiteRuntime());
        }
        if (exchange.current) observe(exchange.current);
      } catch {
        if (desktop.current) void endWebsiteOperator(desktop.current);
        desktop.current = null; owner.current = null; renewal.current = null;
        accept(null); exchange.current = null; setPending(false); setError(operatorLinkFailure);
      }
    };
    receive();
    window.addEventListener("hashchange", receive);
    return () => { observing = false; mounted.current = false; window.removeEventListener("hashchange", receive); };
  }, [accept]);

  const end = useCallback(() => {
    if (recovery.hasDraft() && !window.confirm("Discard your unsaved Customizer changes and end website editing?")) return;
    if (desktop.current) void endWebsiteOperator(desktop.current);
    desktop.current = null; owner.current = null; renewal.current = null;
    accept(null); recovery.clear(); exchange.current = null; setPending(false); setError(null);
  }, [recovery, accept]);
  const dismiss = useCallback(() => setError(null), []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!recovery.hasDraft()) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recovery]);
  useEffect(() => {
    if (!session) return;
    const expire = () => {
      if (Date.now() >= session.expiresAt && currentSession.current === session) {
        accept(null); exchange.current = null;
        setError(recovery.hasDraft()
          ? "Website editing expired. Your unsaved draft is kept in this tab. Reconnect to ConvexPress to recover it. Keep this tab open."
          : "Website editing expired. Reconnect to ConvexPress to continue.");
      }
    };
    const timer = window.setTimeout(expire, Math.max(0, session.expiresAt - Date.now()));
    const refresh = desktop.current && owner.current ? window.setTimeout(reconnect, Math.max(1000, session.expiresAt - Date.now() - 60_000)) : null;
    window.addEventListener("focus", expire); document.addEventListener("visibilitychange", expire);
    return () => { window.clearTimeout(timer); if (refresh !== null) window.clearTimeout(refresh); window.removeEventListener("focus", expire); document.removeEventListener("visibilitychange", expire); };
  }, [session, recovery, accept, reconnect]);
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === "hidden") return;
      if (!currentSession.current || currentSession.current.expiresAt - Date.now() < 60_000) reconnect();
    };
    window.addEventListener("online", resume); window.addEventListener("focus", resume);
    return () => { window.removeEventListener("online", resume); window.removeEventListener("focus", resume); };
  }, [reconnect]);
  const key = JSON.stringify([auth.isLoaded, auth.userId ?? null, auth.sessionId ?? null, auth.orgId ?? null]);
  const canReconnect = !!desktop.current && !!owner.current;
  const operator = useMemo(() => ({ active: !!session, expiresAt: session?.expiresAt ?? null, pending, error, end, dismiss, reconnect, canReconnect }), [session, pending, error, end, dismiss, reconnect, canReconnect]);
  const draftAccess = useMemo(() => session ? recovery.access(session) : null, [session, recovery]);
  return <WebsiteOperatorContext.Provider value={operator}>
    <OperatorDraftContext.Provider value={draftAccess}>
      {session ? <OperatorProvider key={`operator:${session.instanceKey}:${session.userId ?? session.expiresAt}`} {...props} session={session} fetchAccessToken={fetchOperatorToken} /> : <ConvexProviderWithClerk key={key} {...props} useAuth={useAuth} />}
    </OperatorDraftContext.Provider>
  </WebsiteOperatorContext.Provider>;
}
