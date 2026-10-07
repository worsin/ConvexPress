import { useEffect, useRef, useSyncExternalStore } from "react";

const desktopQuery = "(min-width: 1024px)";
function subscribeDesktop(onChange: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function desktopSnapshot() { return window.matchMedia(desktopQuery).matches; }
const serverSnapshot = () => false;
export function useDesktopShop() {
  return useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverSnapshot);
}

/** A URL question stays pending until the visible rail has a usable session.
 * Claim synchronously so StrictMode or an unrelated render cannot send it twice. */
export function usePendingAssistantPrompt({ active, ready, sending, prompt, send, consumed }: {
  active: boolean;
  ready: boolean;
  sending: boolean;
  prompt?: string | null;
  send(prompt: string): Promise<unknown>;
  consumed?: () => void;
}) {
  const claimed = useRef<string | null>(null);
  useEffect(() => {
    if (!prompt) { claimed.current = null; return; }
    if (!active || !ready || sending || claimed.current === prompt) return;
    claimed.current = prompt;
    void send(prompt);
    consumed?.();
  }, [active, ready, sending, prompt, send, consumed]);
}

export function assistantIdentityReady(auth: { isLoaded: boolean; isSignedIn?: boolean }, convex: { isLoading: boolean; isAuthenticated: boolean }) {
  return auth.isLoaded && !convex.isLoading &&
    (auth.isSignedIn === false || (auth.isSignedIn === true && convex.isAuthenticated));
}
