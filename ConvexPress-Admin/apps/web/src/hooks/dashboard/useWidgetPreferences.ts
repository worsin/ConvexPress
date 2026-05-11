/**
 * Dashboard System - Widget Preferences Hook
 *
 * Manages widget layout preferences with optimistic updates.
 * Wraps Convex queries and mutations for the dashboardPreferences table.
 *
 * Uses:
 *   useQuery(api.dashboard.queries.getWidgetPreferences, { surface })
 *   useMutation(api.dashboard.mutations.*)
 */

import { useCallback, useMemo } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { WidgetPreferences } from "@/lib/dashboard/types";
import { getDefaultWidgetOrder } from "@/lib/dashboard/widget-registry";

const DEFAULT_PREFS: WidgetPreferences = {
  widgetOrder: getDefaultWidgetOrder(),
  hiddenWidgets: [],
  collapsedWidgets: [],
  welcomeDismissed: false,
};

/**
 * Hook for managing dashboard widget preferences.
 *
 * @param surface - "admin" or "website"
 */
export function useWidgetPreferences(surface: "admin" | "website" = "admin") {
  const rawPrefs = useQuery(api.dashboard.queries.getWidgetPreferences, {
    surface,
  }) as WidgetPreferences | null | undefined;

  const prefs: WidgetPreferences = useMemo(
    () => rawPrefs ?? DEFAULT_PREFS,
    [rawPrefs],
  );

  const isLoading = rawPrefs === undefined;

  // ── Mutations ───────────────────────────────────────────────────────────

  const savePrefs = useMutation(
    api.dashboard.mutations.saveWidgetPreferences,
  );
  const dismissWidgetMutation = useMutation(
    api.dashboard.mutations.dismissWidget,
  );
  const restoreWidgetMutation = useMutation(
    api.dashboard.mutations.restoreWidget,
  );
  const toggleCollapseMutation = useMutation(
    api.dashboard.mutations.toggleWidgetCollapse,
  );
  const reorderMutation = useMutation(
    api.dashboard.mutations.reorderWidgets,
  );
  const dismissWelcomeMutation = useMutation(
    api.dashboard.mutations.dismissWelcome,
  );

  // ── Actions ─────────────────────────────────────────────────────────────

  const dismissWidget = useCallback(
    (widgetId: string) => {
      dismissWidgetMutation({ surface, widgetId });
    },
    [surface, dismissWidgetMutation],
  );

  const restoreWidget = useCallback(
    (widgetId: string) => {
      restoreWidgetMutation({ surface, widgetId });
    },
    [surface, restoreWidgetMutation],
  );

  const toggleCollapse = useCallback(
    (widgetId: string) => {
      toggleCollapseMutation({ surface, widgetId });
    },
    [surface, toggleCollapseMutation],
  );

  const reorderWidgets = useCallback(
    (widgetOrder: { primary: string[]; secondary: string[] }) => {
      reorderMutation({ surface, widgetOrder });
    },
    [surface, reorderMutation],
  );

  const dismissWelcome = useCallback(() => {
    dismissWelcomeMutation({ surface });
  }, [surface, dismissWelcomeMutation]);

  const isWidgetHidden = useCallback(
    (widgetId: string) => prefs.hiddenWidgets.includes(widgetId),
    [prefs.hiddenWidgets],
  );

  const isWidgetCollapsed = useCallback(
    (widgetId: string) => prefs.collapsedWidgets.includes(widgetId),
    [prefs.collapsedWidgets],
  );

  return {
    prefs,
    isLoading,
    dismissWidget,
    restoreWidget,
    toggleCollapse,
    reorderWidgets,
    dismissWelcome,
    isWidgetHidden,
    isWidgetCollapsed,
  };
}
