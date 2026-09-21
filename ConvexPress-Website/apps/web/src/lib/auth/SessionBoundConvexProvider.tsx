import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexProviderWithAuth } from "convex/react";
import { useAuth } from "./clerk";
import { getSiteRuntime } from "../site-runtime";
import { exchangeOperatorCode, operatorLinkFailure, operatorNetworkFailure, OperatorNetworkError, takeOperatorCode, type WebsiteOperatorSession } from "./websiteOperator";
import { WebsiteOperatorContext } from "./WebsiteOperatorContext";

type Props = Omit<ComponentProps<typeof ConvexProviderWithClerk>, "useAuth">;

function OperatorProvider({ session, ...props }: Props & { session: WebsiteOperatorSession }) {
  const fetchAccessToken = useCallback(async () => session.expiresAt > Date.now() ? session.token : null, [session]);
  const value = useMemo(() => ({ isLoading: false, isAuthenticated: session.expiresAt > Date.now(), fetchAccessToken }), [session, fetchAccessToken]);
  const useOperatorAuth = useCallback(() => value, [value]);
  return <ConvexProviderWithAuth {...props} useAuth={useOperatorAuth} />;
}

/** The installed adapter memoizes its token callback by organization. Scope its
 * lifetime to the actual Clerk session too, so same-org account changes perform
 * normal Convex authentication again and discard the prior provider subtree. */
export function SessionBoundConvexProvider(
	props: Props,
) {
	const auth = useAuth();
	const [session, setSession] = useState<WebsiteOperatorSession | null>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// StrictMode replays effects: observe one exchange promise, never redeem twice.
	const exchange = useRef<Promise<WebsiteOperatorSession> | null>(null);
	useEffect(() => {
		let mounted = true;
		const observe = (attempt: Promise<WebsiteOperatorSession>) => {
			setPending(true);
			void attempt.then(value => {
				if (mounted && exchange.current === attempt) { setSession(value); setError(null); }
			}, cause => { if (mounted && exchange.current === attempt) setError(cause instanceof OperatorNetworkError ? operatorNetworkFailure : operatorLinkFailure); }).finally(() => { if (mounted && exchange.current === attempt) setPending(false); });
		};
		const receive = () => {
			try {
				const code = takeOperatorCode(window.location, window.history);
				if (code) { exchange.current = exchangeOperatorCode(code, getSiteRuntime()); setSession(null); setError(null); }
				if (exchange.current) observe(exchange.current);
			} catch { exchange.current = null; setSession(null); setPending(false); setError(operatorLinkFailure); }
		};
		receive();
		window.addEventListener("hashchange", receive);
		return () => { mounted = false; window.removeEventListener("hashchange", receive); };
	}, []);
	const end = useCallback(() => { setSession(null); exchange.current = null; setPending(false); setError(null); }, []);
	const dismiss = useCallback(() => setError(null), []);
	useEffect(() => {
		if (!session) return;
		const expire = () => {
			if (Date.now() >= session.expiresAt) {
				setSession(null); exchange.current = null;
				setError("Website editing expired. Reopen it from ConvexPress to continue.");
			}
		};
		const timer = window.setTimeout(expire, Math.max(0, session.expiresAt - Date.now()));
		window.addEventListener("focus", expire);
		document.addEventListener("visibilitychange", expire);
		return () => { window.clearTimeout(timer); window.removeEventListener("focus", expire); document.removeEventListener("visibilitychange", expire); };
	}, [session]);
	const key = JSON.stringify([
		auth.isLoaded,
		auth.userId ?? null,
		auth.sessionId ?? null,
		auth.orgId ?? null,
	]);
	const operator = useMemo(() => ({ active: !!session, expiresAt: session?.expiresAt ?? null, pending, error, end, dismiss }), [session, pending, error, end, dismiss]);
	return <WebsiteOperatorContext.Provider value={operator}>
		{session ? <OperatorProvider key={`operator:${session.instanceKey}:${session.expiresAt}`} {...props} session={session} /> : <ConvexProviderWithClerk key={key} {...props} useAuth={useAuth} />}
	</WebsiteOperatorContext.Provider>;
}
