import { useEffect, useState } from "react";

const SESSION_KEY = "commerce_session_token";

export function useCommerceSessionToken() {
  const [sessionToken, setSessionToken] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    try {
      const existing = localStorage.getItem(SESSION_KEY);
      if (existing) return existing;
    } catch {
      // localStorage unavailable
    }

    const nextToken = crypto.randomUUID();
    try {
      localStorage.setItem(SESSION_KEY, nextToken);
    } catch {
      // localStorage unavailable
    }
    return nextToken;
  });

  useEffect(() => {
    if (sessionToken) return;

    const nextToken = crypto.randomUUID();
    try {
      localStorage.setItem(SESSION_KEY, nextToken);
    } catch {
      // localStorage unavailable
    }
    setSessionToken(nextToken);
  }, [sessionToken]);

  return {
    sessionToken,
    isReady: sessionToken !== undefined,
  };
}
