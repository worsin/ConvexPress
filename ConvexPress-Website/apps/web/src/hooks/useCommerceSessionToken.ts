import { useEffect, useRef, useState } from "react";
import { useConvex, useConvexAuth, useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { useSettings } from "@/contexts/SettingsContext";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/clerk";
import { getSiteRuntime } from "@/lib/site-runtime";
import { persistCommerceSession, resolveCommerceSession, type CommerceSession } from "./commerce-session";
const memorySessions = new Map<string, CommerceSession>();
const clientResolutions = new WeakMap<object, Map<string, Promise<string>>>();

/**
 * Anonymous commerce session token, persisted in localStorage.
 *
 * The token is resolved in an effect rather than during render so the server
 * and the hydrating client render the same tree (cart controls start disabled
 * on both, then enable once the token is known). Reading storage in the state
 * initializer made the client render `disabled={false}` against the server's
 * `disabled=""` and tripped React's hydration mismatch on every product grid.
 */
export function useCommerceSessionToken() {
  const auth = useAuth();
  const convex = useConvexAuth();
  const settings = useSettings();
  const client = useConvex();
  const runtime = getSiteRuntime();
  const scope = JSON.stringify([runtime.convexUrl, runtime.instanceKey ?? null]);
  const settle = useMutation((api as any).commerce.assistant.mutations.resolveSession);
  const identitySettled = auth.isSignedIn === true
    ? Boolean(auth.userId && auth.sessionId && convex.isAuthenticated)
    : auth.isSignedIn === false && !auth.userId && !auth.sessionId && !convex.isAuthenticated;
  const ready = Boolean(runtime.convexUrl) && settings?.plugins?.commerceEnabled === true && auth.isLoaded && !convex.isLoading && identitySettled;
  const owner = auth.userId || "anonymous";
  const authority = JSON.stringify([scope, owner, auth.sessionId ?? null, ready]);
  const lifetime = useRef({ authority, client, generation: 0 });
  if (lifetime.current.authority !== authority || lifetime.current.client !== client) {
    lifetime.current = { authority, client, generation: lifetime.current.generation + 1 };
  }
  const [session, setSession] = useState<{ value: CommerceSession; generation: number }>();

  useEffect(() => {
    if (!ready) return;
    let current = true;
    const generation = lifetime.current.generation;
    const isCurrent = () => current && lifetime.current.generation === generation && lifetime.current.client === client;
    let resolutions = clientResolutions.get(client);
    if (!resolutions) { resolutions = new Map(); clientResolutions.set(client, resolutions); }
    let key: string | undefined, request: Promise<string> | undefined;
    const resolve = async () => {
      let store: Storage | undefined;
      try { store = localStorage; } catch { /* Storage disabled. */ }
      const proposed = resolveCommerceSession(store, owner, scope, memorySessions.get(scope));
      memorySessions.set(scope, proposed);
      key = JSON.stringify([authority, proposed.token]);
      request = resolutions.get(key);
      if (!request) {
        request = settle({ sessionToken: proposed.token }) as Promise<string>;
        resolutions.set(key, request);
        const pending = request, requestKey = key;
        void request.finally(() => { if (resolutions.get(requestKey) === pending) resolutions.delete(requestKey); }).catch(() => undefined);
      }
      try {
        const token = await request;
        if (!isCurrent()) return;
        const value = { token, owner, scope };
        memorySessions.set(scope, value);
        persistCommerceSession(store, value);
        setSession({ value, generation });
      } catch {
        if (isCurrent()) {
          setSession(undefined);
          toast.error("Could not restore your shopping session. Refresh to try again.", { id: "commerce-session" });
        }
      }
    };
    void resolve();
    // Reuse the resolved token in other consumers without causing cross-tab
    // storage writes to alternate between two simultaneously signed-in accounts.
    return () => {
      current = false;
      // Keep StrictMode/concurrent consumers deduplicated, but never let a
      // superseded authority's promise settle a later return to that authority.
      if (lifetime.current.generation !== generation && key && resolutions.get(key) === request) resolutions.delete(key);
    };
  }, [authority, client, owner, ready, scope, settle]);
  if (!ready || session?.generation !== lifetime.current.generation || session.value.owner !== owner || session.value.scope !== scope) {
    return { sessionToken: undefined, isReady: false };
  }
  return {
    sessionToken: session.value.token,
    isReady: true,
  };
}
