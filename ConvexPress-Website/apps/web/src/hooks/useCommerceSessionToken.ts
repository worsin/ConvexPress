import { useEffect, useState } from "react";

const SESSION_KEY = "commerce_session_token";

export function useCommerceSessionToken() {
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    try {
      const existing = localStorage.getItem(SESSION_KEY);
      if (existing) {
        setSessionToken(existing);
        return;
      }
    } catch {
      // localStorage unavailable
    }

    const nextToken = crypto.randomUUID();
    try {
      localStorage.setItem(SESSION_KEY, nextToken);
    } catch {
      // localStorage unavailable
    }
    setSessionToken(nextToken);
  }, []);

  return {
    sessionToken,
    isReady: sessionToken !== undefined,
  };
}
