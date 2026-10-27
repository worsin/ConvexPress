/**
 * The public settings as components read them: the context value and its
 * hooks, without the query client that fills it (see SettingsContext.tsx),
 * so a component that only reads a setting doesn't depend on Convex.
 */
import { createContext, useContext } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@convexpress-website/backend/generated/api";

/**
 * Public settings values exposed to the website frontend: exactly what the
 * `settings.queries.getPublic` query returns (its return validator is the
 * contract). Sensitive fields (adminEmail, moderationWordList, etc.) are
 * excluded by that query.
 */
export type PublicSettings = FunctionReturnType<typeof api.settings.queries.getPublic>;

export const SettingsContext = createContext<PublicSettings | null>(null);

/**
 * Access the public settings from any component within the SettingsProvider.
 *
 * Returns null while settings are loading (Convex query in flight).
 * Components should handle the null case with a loading state or defaults.
 *
 * @returns Public settings object or null if loading
 */
export function useSettings(): PublicSettings | null {
  return useContext(SettingsContext);
}

/**
 * Access a single settings value by key.
 * Returns undefined if settings are not loaded yet.
 *
 * @param key - The settings key to access
 * @returns The setting value or undefined
 */
export function useSetting<K extends keyof PublicSettings>(
  key: K,
): PublicSettings[K] | undefined {
  const settings = useContext(SettingsContext);
  return settings?.[key];
}
