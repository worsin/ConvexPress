import { useEffect, useRef, useState } from "react";
import { useConvex, useConvexAuth, useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { useSettings } from "@/contexts/SettingsContext";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/clerk";
import { getSiteRuntime } from "@/lib/site-runtime";
import { persistCommerceSession, resolveCommerceSession, type CommerceSession } from "./commerce-session";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
const memorySessions = new Map<string, CommerceSession>();
const clientResolutions = new WeakMap<object, Map<string, Promise<string>>>();
const sessionRevisions = new Map<string, number>();
const clientSessionListeners = new WeakMap<object, Map<string, Set<(session: CommerceSession) => void>>>();
const selectionRequests = new WeakMap<object, Map<string, number>>();

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
  const selectSaved = useMutation(api.commerce.cartRecovery.selectSaved);
  const combineSaved = useMutation(api.commerce.cartRecovery.combineSaved);
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
  const mounted = useRef(false);

  useEffect(() => {
    if (!ready) return;
    let current = true;
    mounted.current = true;
    const generation = lifetime.current.generation;
    const isCurrent = () => current && lifetime.current.generation === generation && lifetime.current.client === client;
    let clientListeners = clientSessionListeners.get(client);
    if (!clientListeners) { clientListeners = new Map(); clientSessionListeners.set(client, clientListeners); }
    let listeners = clientListeners.get(authority);
    if (!listeners) { listeners = new Set(); clientListeners.set(authority, listeners); }
    const receive = (value: CommerceSession) => {
      if (isCurrent() && value.owner === owner) setSession({ value, generation });
    };
    listeners.add(receive);
    let resolutions = clientResolutions.get(client);
    if (!resolutions) { resolutions = new Map(); clientResolutions.set(client, resolutions); }
    let key: string | undefined, request: Promise<string> | undefined;
    const resolve = async () => {
      let store: Storage | undefined;
      try { store = localStorage; } catch { /* Storage disabled. */ }
      const proposed = resolveCommerceSession(store, owner, scope, memorySessions.get(scope));
      const revision = sessionRevisions.get(scope) ?? 0;
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
        if (!isCurrent() || (sessionRevisions.get(scope) ?? 0) !== revision) return;
        const value = { token, owner, scope };
        memorySessions.set(scope, value);
        persistCommerceSession(store, value);
        setSession({ value, generation });
      } catch {
        if (isCurrent() && (sessionRevisions.get(scope) ?? 0) === revision) {
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
      mounted.current = false;
      listeners.delete(receive);
      if (listeners.size === 0) clientListeners.delete(authority);
      // Keep StrictMode/concurrent consumers deduplicated, but never let a
      // superseded authority's promise settle a later return to that authority.
      if (lifetime.current.generation !== generation && key && resolutions.get(key) === request) resolutions.delete(key);
    };
  }, [authority, client, owner, ready, scope, settle]);
  const generation = lifetime.current.generation;
  const changeCart = async (cartId: Id<"commerce_carts">, combine = false) => {
    const isCurrent = () => mounted.current && ready && generation === lifetime.current.generation && lifetime.current.client === client;
    if (!isCurrent() || !session || session.generation !== generation) return false;
    const revision = sessionRevisions.get(scope) ?? 0;
    let requests = selectionRequests.get(client);
    if (!requests) { requests = new Map(); selectionRequests.set(client, requests); }
    const requestId = (requests.get(authority) ?? 0) + 1;
    requests.set(authority, requestId);
    const isLatest = () => isCurrent() && requests.get(authority) === requestId && (sessionRevisions.get(scope) ?? 0) === revision;
    try {
      const token = await (combine ? combineSaved : selectSaved)({ sessionToken: session.value.token, cartId });
      if (!isLatest()) return false;
      const value = { token, owner, scope };
      sessionRevisions.set(scope, revision + 1);
      memorySessions.set(scope, value);
      let store: Storage | undefined;
      try { store = localStorage; } catch { /* Storage disabled. */ }
      persistCommerceSession(store, value);
      for (const receive of clientSessionListeners.get(client)?.get(authority) ?? []) receive(value);
      return true;
    } catch (error) {
      if (!isLatest()) return false;
      throw error;
    }
  };
  if (!ready || session?.generation !== lifetime.current.generation || session.value.owner !== owner || session.value.scope !== scope) {
    return { sessionToken: undefined, isReady: false, changeCart };
  }
  return {
    sessionToken: session.value.token,
    isReady: true,
    changeCart,
  };
}
