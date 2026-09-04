import { useEffect, useState } from "react";

const SESSION_KEY = "commerce_session_token";

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
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    let token: string | null = null;
    try {
      token = localStorage.getItem(SESSION_KEY);
    } catch {
      // localStorage unavailable
    }
    if (!token) {
      token = crypto.randomUUID();
      try {
        localStorage.setItem(SESSION_KEY, token);
      } catch {
        // localStorage unavailable
      }
    }
    setSessionToken(token);
  }, []);

  return {
    sessionToken,
    isReady: sessionToken !== undefined,
  };
}
