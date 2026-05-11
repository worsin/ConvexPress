import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminShell } from "./useAdminShell";
import { LS_KEY_SCREEN_OPTIONS_PREFIX } from "@/lib/admin-shell/constants";
import type { ScreenOptionsConfig } from "@/lib/admin-shell/types";

/**
 * Per-page screen options registration and management hook.
 *
 * WordPress equivalent: `add_screen_option()` / `WP_Screen` class.
 *
 * Registers screen options config in the AdminShellContext on mount,
 * clears it on unmount. Persists user preferences to localStorage
 * per route key.
 *
 * Usage:
 * ```tsx
 * function AllPostsPage() {
 *   const screenOptions = useScreenOptions("posts-list", {
 *     columns: [
 *       { id: "title", label: "Title", visible: true },
 *       { id: "author", label: "Author", visible: true },
 *       { id: "date", label: "Date", visible: true },
 *       { id: "categories", label: "Categories", visible: false },
 *     ],
 *     perPage: { value: 20, options: [10, 20, 50, 100], label: "Posts" },
 *   });
 *
 *   // Use screenOptions.config to get current values
 *   // Use screenOptions.setColumn, setPerPage, etc. to change
 * }
 * ```
 *
 * @param routeId - Unique identifier for the route (used as localStorage key)
 * @param defaultConfig - Default screen options configuration
 */
export function useScreenOptions(
  routeId: string,
  defaultConfig: ScreenOptionsConfig,
) {
  const { setScreenOptions } = useAdminShell();
  const storageKey = `${LS_KEY_SCREEN_OPTIONS_PREFIX}${routeId}`;

  // ─── Load persisted config or use defaults ─────────────────────────
  const [config, setConfigState] = useState<ScreenOptionsConfig>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ScreenOptionsConfig>;
        return mergeWithDefaults(defaultConfig, parsed);
      }
    } catch {
      // localStorage unavailable or invalid JSON
    }
    return defaultConfig;
  });

  // ─── Open/close state ───────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // ─── Persist to localStorage on config change ───────────────────────
  const persistConfig = useCallback(
    (newConfig: ScreenOptionsConfig) => {
      setConfigState(newConfig);
      try {
        localStorage.setItem(storageKey, JSON.stringify(newConfig));
      } catch {
        // localStorage unavailable
      }
    },
    [storageKey],
  );

  // ─── Register in shell context on mount, clear on unmount ──────────
  useEffect(() => {
    setScreenOptions(config);
    return () => {
      setScreenOptions(null);
    };
    // Only run on mount/unmount - config changes are handled by persistConfig
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Update shell context when config changes ──────────────────────
  useEffect(() => {
    setScreenOptions(config);
  }, [config, setScreenOptions]);

  // ─── Column visibility toggle ──────────────────────────────────────
  const setColumn = useCallback(
    (columnId: string, visible: boolean) => {
      const newConfig: ScreenOptionsConfig = {
        ...config,
        columns: config.columns?.map((col) =>
          col.id === columnId ? { ...col, visible } : col,
        ),
      };
      persistConfig(newConfig);
    },
    [config, persistConfig],
  );

  // ─── Items per page ─────────────────────────────────────────────────
  const setPerPage = useCallback(
    (value: number) => {
      if (!config.perPage) return;
      const newConfig: ScreenOptionsConfig = {
        ...config,
        perPage: { ...config.perPage, value },
      };
      persistConfig(newConfig);
    },
    [config, persistConfig],
  );

  // ─── Custom field update ────────────────────────────────────────────
  const setCustom = useCallback(
    (fieldId: string, value: unknown) => {
      const newConfig: ScreenOptionsConfig = {
        ...config,
        custom: config.custom?.map((field) =>
          field.id === fieldId ? { ...field, value } : field,
        ),
      };
      persistConfig(newConfig);
    },
    [config, persistConfig],
  );

  // ─── Reset to defaults ──────────────────────────────────────────────
  const reset = useCallback(() => {
    persistConfig(defaultConfig);
  }, [defaultConfig, persistConfig]);

  return useMemo(
    () => ({
      config,
      isOpen,
      toggle,
      setColumn,
      setPerPage,
      setCustom,
      reset,
    }),
    [config, isOpen, toggle, setColumn, setPerPage, setCustom, reset],
  );
}

/**
 * Merge stored partial config with full defaults.
 * Stored values take precedence; missing values use defaults.
 */
function mergeWithDefaults(
  defaults: ScreenOptionsConfig,
  stored: Partial<ScreenOptionsConfig>,
): ScreenOptionsConfig {
  const result: ScreenOptionsConfig = { ...defaults };

  // Merge columns: use stored visibility for matching IDs
  if (defaults.columns && stored.columns) {
    const storedMap = new Map(stored.columns.map((c) => [c.id, c.visible]));
    result.columns = defaults.columns.map((col) => ({
      ...col,
      visible: storedMap.has(col.id) ? storedMap.get(col.id)! : col.visible,
    }));
  }

  // Merge perPage: use stored value if valid
  if (defaults.perPage && stored.perPage) {
    const storedValue = stored.perPage.value;
    if (
      typeof storedValue === "number" &&
      defaults.perPage.options.includes(storedValue)
    ) {
      result.perPage = { ...defaults.perPage, value: storedValue };
    }
  }

  // Merge custom fields: use stored values for matching IDs
  if (defaults.custom && stored.custom) {
    const storedMap = new Map(stored.custom.map((c) => [c.id, c.value]));
    result.custom = defaults.custom.map((field) => ({
      ...field,
      value: storedMap.has(field.id) ? storedMap.get(field.id) : field.value,
    }));
  }

  return result;
}
