/**
 * useSeoMutations - Hook wrapping SEO mutations with toast notifications.
 *
 * Provides: updatePostSeo, updateGlobal, updateRobots, generateSitemap
 */

import { useCallback } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@backend/convex/_generated/api";

export function useSeoMutations() {
  const updatePostSeoMutation = useMutation(api.seo.mutations.updatePostSeo);
  const updateGlobalMutation = useMutation(api.seo.mutations.updateGlobal);
  const updateRobotsMutation = useMutation(api.seo.mutations.updateRobots);
  const generateSitemapMutation = useMutation(api.seo.mutations.generateSitemap);

  const updatePostSeo = useCallback(
    async (args: Parameters<typeof updatePostSeoMutation>[0]) => {
      try {
        const result = await updatePostSeoMutation(args);
        return result;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update SEO.";
        toast.error(message);
        throw error;
      }
    },
    [updatePostSeoMutation],
  );

  const updateGlobal = useCallback(
    async (args: Parameters<typeof updateGlobalMutation>[0]) => {
      try {
        const result = await updateGlobalMutation(args);
        toast.success("SEO settings saved.");
        return result;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to save SEO settings.";
        toast.error(message);
        throw error;
      }
    },
    [updateGlobalMutation],
  );

  const updateRobots = useCallback(
    async (args: Parameters<typeof updateRobotsMutation>[0]) => {
      try {
        const result = await updateRobotsMutation(args);
        toast.success("Robots.txt settings saved.");
        return result;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to save robots.txt settings.";
        toast.error(message);
        throw error;
      }
    },
    [updateRobotsMutation],
  );

  const generateSitemap = useCallback(async () => {
    try {
      const result = await generateSitemapMutation({});
      toast.success("Sitemap regeneration started.");
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to regenerate sitemap.";
      toast.error(message);
      throw error;
    }
  }, [generateSitemapMutation]);

  return {
    updatePostSeo,
    updateGlobal,
    updateRobots,
    generateSitemap,
  };
}
