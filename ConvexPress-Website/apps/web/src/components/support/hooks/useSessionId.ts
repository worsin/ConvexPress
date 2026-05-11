/**
 * Session ID hook for anonymous widget tracking.
 *
 * Returns undefined until client-side hydration completes, preventing
 * SSR/client mismatches. Consumers should check `isReady` before using
 * `sessionId` in queries or mutations.
 *
 * The session ID persists in localStorage for 24 hours, then regenerates.
 */

import { useState, useEffect } from "react";

const SESSION_KEY = "support_session";
const TTL = 24 * 60 * 60 * 1000; // 24 hours

export function useSessionId() {
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.expiresAt > Date.now()) {
          setSessionId(parsed.id);
          return;
        }
      }
    } catch {
      // localStorage not available or parse error
    }

    const newId = crypto.randomUUID();
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        id: newId,
        expiresAt: Date.now() + TTL,
      }));
    } catch {
      // localStorage not available
    }
    setSessionId(newId);
  }, []);

  return { sessionId, isReady: sessionId !== undefined };
}
