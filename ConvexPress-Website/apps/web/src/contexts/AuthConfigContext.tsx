/**
 * Auth config context — the site's Clerk connection as seen by the website.
 *
 * Provided once from the root route (SSR loader → hydration), so every auth
 * screen can ask "what does this site's Clerk accept?" without another query.
 */

import { createContext, useContext, type ReactNode } from "react";

import { defaultWebsiteAuthConfig, type AuthCapabilities, type WebsiteAuthConfig } from "@/lib/auth/capabilities";

const AuthConfigContext = createContext<WebsiteAuthConfig>(defaultWebsiteAuthConfig());

export function AuthConfigProvider({ value, children }: { value: WebsiteAuthConfig; children: ReactNode }) {
  return <AuthConfigContext.Provider value={value}>{children}</AuthConfigContext.Provider>;
}

export function useAuthConfig(): WebsiteAuthConfig {
  return useContext(AuthConfigContext);
}

export function useAuthCapabilities(): AuthCapabilities {
  return useContext(AuthConfigContext).capabilities;
}
