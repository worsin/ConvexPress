/**
 * useSitemapMutations Hook
 *
 * Wraps sitemap mutations and actions with toast notifications.
 * Provides updateSettings and generate functions for the admin UI.
 *
 * React 19: Uses useActionState for the regenerate action to replace
 * manual isRegenerating/setIsRegenerating state management. The
 * isPending flag from useActionState tracks the async action lifecycle
 * automatically.
 */

import { useCallback, useActionState } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import type { SitemapSettings } from "@/lib/sitemaps/types";

interface RegenerateState {
  result: unknown;
  error: string | null;
}

export function useSitemapMutations() {
  const updateSettingsMutation = useMutation(api.sitemaps.mutations.updateSettings);
  const generateAction = useAction(api.sitemaps.actions.generate);

  const updateSettings = useCallback(
    async (settings: Partial<SitemapSettings>) => {
      try {
        await updateSettingsMutation({ settings });
        toast.success("Sitemap settings saved");
        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to save settings";
        toast.error(message);
        return false;
      }
    },
    [updateSettingsMutation],
  );

  // Fix C1: useActionState replaces manual setIsRegenerating(true/false)
  // pattern. isPending tracks async lifecycle automatically.
  const [_regenerateState, regenerateAction, isRegenerating] = useActionState<RegenerateState, boolean | undefined>(
    async (_prevState, force) => {
      try {
        const result = await generateAction({ force: force ?? false });
        toast.success("Sitemap regenerated successfully");
        return { result, error: null };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to regenerate sitemap";
        toast.error(message);
        return { result: null, error: message };
      }
    },
    { result: null, error: null },
  );

  // Wrap regenerateAction to match the existing API (accepts optional force boolean)
  const regenerate = useCallback(
    async (force = false) => {
      regenerateAction(force);
    },
    [regenerateAction],
  );

  return {
    updateSettings,
    regenerate,
    isRegenerating,
  };
}
