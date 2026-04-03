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

  // Keep ref in sync with state
  useEffect(() => {
    accessTokenRef.current = state.accessToken;
  }, [state.accessToken]);

  const attemptRefresh = useCallback(async () => {
    try {
      const response = await fetch(`${CONVEX_SITE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setTokens(data.accessToken, data.expiresIn);
      } else {
        setState((s) => ({ ...s, isLoading: false, accessToken: null, user: null }));
      }
    } catch {
      setState((s) => ({ ...s, isLoading: false, accessToken: null, user: null }));
    }
  }, []);

  const setTokens = useCallback((accessToken: string, expiresIn: number) => {
    const payload = JSON.parse(atob(accessToken.split(".")[1]));
    const expiresAt = Date.now() + expiresIn * 1000;

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
      refreshTimeoutRef.current = setTimeout(attemptRefresh, refreshIn);
    }
  }, [attemptRefresh]);

  // Attempt refresh on mount (page load)
  useEffect(() => {
    attemptRefresh();
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [attemptRefresh]);

  const login = useCallback(async (identifier: string, password: string) => {
    const isEmail = identifier.includes("@");
    const body = isEmail
      ? { email: identifier, password }
      : { username: identifier, password };

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
  }, [setTokens]);

  const logout = useCallback(async () => {
    setState({
      accessToken: null,
      expiresAt: null,
      isLoading: false,
      user: null,
    });
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    try {
      await fetch(`${CONVEX_SITE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Best-effort
    }
  }, []);

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
