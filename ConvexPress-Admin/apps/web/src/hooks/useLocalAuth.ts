import { useCallback, useEffect, useRef, useState } from "react";

interface AuthState {
  accessToken: string | null;
  expiresAt: number | null;
  isLoading: boolean;
  user: { id: string; email: string; displayName: string } | null;
}

/**
 * Module-level site URL. Defaults to the Vite env var but can be
 * overridden at bootstrap time for Electron, where env vars aren't
 * available and the URL comes from electron-store instead.
 */
let _siteUrl: string = import.meta.env.VITE_CONVEX_SITE_URL ?? "";

/** Set the Convex site URL used by useLocalAuth. Call before rendering. */
export function setConvexSiteUrl(url: string) {
  _siteUrl = url;
}

export function useLocalAuth() {
  const CONVEX_SITE_URL = _siteUrl;
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    expiresAt: null,
    isLoading: true,
    user: null,
  });
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  const clearAuthState = useCallback(() => {
    accessTokenRef.current = null;
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    setState({
      accessToken: null,
      expiresAt: null,
      isLoading: false,
      user: null,
    });
  }, []);

  const attemptRefreshRef = useRef<() => Promise<void>>(async () => {});

  const setTokens = useCallback((accessToken: string, expiresIn: number) => {
    const tokenParts = accessToken.split(".");
    if (tokenParts.length < 2 || !tokenParts[1]) {
      throw new Error("Invalid access token received from server");
    }

    const payload = JSON.parse(atob(tokenParts[1]));
    const expiresAt = Date.now() + expiresIn * 1000;

    accessTokenRef.current = accessToken;
    setState({
      accessToken,
      expiresAt,
      isLoading: false,
      user: {
        id: payload.sub,
        email: payload.email,
        displayName: payload.name,
      },
    });

    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    const refreshIn = (expiresIn - 60) * 1000;
    if (refreshIn > 0) {
      refreshTimeoutRef.current = setTimeout(() => {
        void attemptRefreshRef.current();
      }, refreshIn);
    }
  }, []);

  const attemptRefresh = useCallback(async () => {
    if (!CONVEX_SITE_URL) {
      clearAuthState();
      return;
    }

    try {
      const response = await fetch(`${CONVEX_SITE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setTokens(data.accessToken, data.expiresIn);
      } else {
        clearAuthState();
      }
    } catch {
      clearAuthState();
    }
  }, [CONVEX_SITE_URL, clearAuthState, setTokens]);

  useEffect(() => {
    attemptRefreshRef.current = attemptRefresh;
  }, [attemptRefresh]);

  // Attempt refresh on mount (page load)
  useEffect(() => {
    attemptRefresh();
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [attemptRefresh]);

  const login = useCallback(async (identifier: string, password: string) => {
    if (!CONVEX_SITE_URL) {
      throw new Error("Convex site URL is not configured.");
    }

    const normalizedIdentifier = identifier.trim();
    const isEmail = normalizedIdentifier.includes("@");
    const body = isEmail
      ? { email: normalizedIdentifier.toLowerCase(), password }
      : { username: normalizedIdentifier, password };

    const response = await fetch(`${CONVEX_SITE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Login failed" }));
      throw new Error(error.error ?? "Login failed");
    }

    const data = await response.json();
    setTokens(data.accessToken, data.expiresIn);
    return data.user;
  }, [CONVEX_SITE_URL, setTokens]);

  const logout = useCallback(async () => {
    clearAuthState();
    if (!CONVEX_SITE_URL) return;

    try {
      await fetch(`${CONVEX_SITE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Best-effort
    }
  }, [CONVEX_SITE_URL, clearAuthState]);

  // ConvexProviderWithAuth expects fetchAccessToken
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (forceRefreshToken) {
        await attemptRefresh();
      }
      return accessTokenRef.current;
    },
    [attemptRefresh],
  );

  return {
    isLoading: state.isLoading,
    isAuthenticated: !!state.accessToken,
    fetchAccessToken,
    user: state.user,
    login,
    logout,
  };
}
