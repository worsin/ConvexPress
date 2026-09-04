import { useCallback, useEffect, useRef, useState } from "react";

import { getElectronAuth } from "@/lib/electron";

interface AuthState {
  accessToken: string | null;
  expiresAt: number | null;
  isLoading: boolean;
  user: { id: string; email: string; displayName: string } | null;
}

interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
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

/**
 * Desktop session transport. The refresh cookie cannot survive a cross-site
 * fetch against a plain-http (LAN / self-hosted) deployment, so in Electron
 * the refresh token is returned in the body, kept in OS-encrypted
 * safeStorage (main process, never in the page), and presented on a header.
 * Browser builds keep using the HttpOnly cookie.
 */
const REFRESH_STORAGE_PREFIX = "convexAuth.refreshToken:";

function refreshStorageKey(siteUrl: string): string {
  return `${REFRESH_STORAGE_PREFIX}${siteUrl.replace(/\/+$/, "")}`;
}

async function loadStoredRefreshToken(siteUrl: string): Promise<string | null> {
  const storage = getElectronAuth();
  if (!storage) return null;
  try {
    return (await storage.getItem(refreshStorageKey(siteUrl))) || null;
  } catch {
    return null;
  }
}

async function storeRefreshToken(siteUrl: string, token: string | null): Promise<void> {
  const storage = getElectronAuth();
  if (!storage) return;
  try {
    if (token) await storage.setItem(refreshStorageKey(siteUrl), token);
    else await storage.removeItem(refreshStorageKey(siteUrl));
  } catch {
    // Protected storage unavailable: the session simply lasts until quit.
  }
}

/** Headers that switch the auth endpoints to the desktop token transport. */
async function sessionHeaders(siteUrl: string, includeToken: boolean): Promise<Record<string, string>> {
  if (!getElectronAuth()) return {};
  const headers: Record<string, string> = { "X-ConvexPress-Session": "token" };
  if (includeToken) {
    const token = await loadStoredRefreshToken(siteUrl);
    if (token) headers["X-ConvexPress-Refresh"] = token;
  }
  return headers;
}

export function decodeAccessTokenPayload(accessToken: string): AccessTokenPayload {
  const tokenParts = accessToken.split(".");
  if (tokenParts.length < 2 || !tokenParts[1]) {
    throw new Error("Invalid access token received from server");
  }

  const base64 = tokenParts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as AccessTokenPayload;
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
    const payload = decodeAccessTokenPayload(accessToken);
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
        headers: await sessionHeaders(CONVEX_SITE_URL, true),
      });

      if (response.status === 204) {
        clearAuthState();
      } else if (response.ok) {
        const data = await response.json();
        if (typeof data.refreshToken === "string") await storeRefreshToken(CONVEX_SITE_URL, data.refreshToken);
        setTokens(data.accessToken, data.expiresIn);
      } else {
        // 401: the stored token was revoked or expired; forget it.
        if (response.status === 401) await storeRefreshToken(CONVEX_SITE_URL, null);
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
      headers: { "Content-Type": "application/json", ...(await sessionHeaders(CONVEX_SITE_URL, false)) },
      credentials: "include",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Login failed" }));
      throw new Error(error.error ?? "Login failed");
    }

    const data = await response.json();
    if (typeof data.refreshToken === "string") await storeRefreshToken(CONVEX_SITE_URL, data.refreshToken);
    setTokens(data.accessToken, data.expiresIn);
    return data.user;
  }, [CONVEX_SITE_URL, setTokens]);

  const logout = useCallback(async () => {
    clearAuthState();
    if (!CONVEX_SITE_URL) return;

    try {
      const headers = await sessionHeaders(CONVEX_SITE_URL, true);
      await storeRefreshToken(CONVEX_SITE_URL, null);
      await fetch(`${CONVEX_SITE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers,
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
