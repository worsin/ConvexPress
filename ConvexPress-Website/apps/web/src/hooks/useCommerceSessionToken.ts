import { useEffect, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { useSettings } from "@/contexts/SettingsContext";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/clerk";
import { resolveCommerceSession, type CommerceSession } from "./commerce-session";
let memorySession: CommerceSession | undefined;
const resolutions = new Map<string, Promise<string>>();

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
  const settle = useMutation((api as any).commerce.assistant.mutations.resolveSession);
  const ready = settings?.plugins?.commerceEnabled === true && auth.isLoaded && !convex.isLoading && (!auth.userId || convex.isAuthenticated);
  const owner = auth.userId || "anonymous";
  const [session, setSession] = useState<CommerceSession>();

  useEffect(() => {
    if (!ready) return;
    let current = true;
    const resolve = async () => {
      let store: Storage | undefined;
      try { store = localStorage; } catch { /* Storage disabled. */ }
      const proposed = resolveCommerceSession(store, owner, memorySession);
      memorySession = proposed;
      const key = `${owner}:${proposed.token}`;
      let request = resolutions.get(key);
      if (!request) {
        request = settle({ sessionToken: proposed.token }) as Promise<string>;
        resolutions.set(key, request);
        void request.finally(() => { resolutions.delete(key); }).catch(() => undefined);
      }
      try {
        const token = await request;
        if (!current) return;
        memorySession = { token, owner };
        try { store?.setItem("commerce_session_token", token); store?.setItem("commerce_session_owner", owner); } catch { /* Storage disabled. */ }
        setSession(memorySession);
      } catch {
        if (current) {
          setSession(undefined);
          toast.error("Could not restore your shopping session. Refresh to try again.", { id: "commerce-session" });
        }
      }
    };
    void resolve();
    // Reuse the resolved token in other consumers without causing cross-tab
    // storage writes to alternate between two simultaneously signed-in accounts.
    return () => { current = false; };
  }, [owner, ready, settle]);
  if (!ready || session?.owner !== owner) {
    return { sessionToken: undefined, isReady: false };
  }
  return {
    sessionToken: session.token,
    isReady: true,
  };
}
