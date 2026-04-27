import { useMemo } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";

import {
  ADMIN_PLUGINS,
  DEFAULT_PLUGIN_SETTINGS,
  type AdminPluginId,
  type PluginSettingsValues,
  isPluginEnabled,
} from "@/lib/plugins/registry";

export function usePluginSettings() {
  const result = useQuery(api.settings.queries.getBySection, {
    section: "plugins" as const,
  }) as (PluginSettingsValues & {
    _id?: string | null;
    updatedAt?: number | null;
    updatedBy?: string | null;
  }) | null | undefined;

  const values = useMemo<PluginSettingsValues>(
    () => ({
      ...DEFAULT_PLUGIN_SETTINGS,
      ...(result ?? {}),
    }),
    [result],
  );

  const plugins = useMemo(
    () =>
      ADMIN_PLUGINS.map((plugin) => ({
        ...plugin,
        enabled: isPluginEnabled(plugin.id, values),
      })),
    [values],
  );

  return {
    isLoading: result === undefined,
    values,
    plugins,
    isEnabled: (pluginId: AdminPluginId) => isPluginEnabled(pluginId, values),
  };
}
