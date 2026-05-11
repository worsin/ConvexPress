/**
 * useMetaboxOrder - Metabox ordering, collapse, and visibility preferences
 *
 * Manages metabox drag-and-drop ordering and persists preferences to localStorage.
 * Provides sensor configuration for @dnd-kit.
 */

import { useCallback, useMemo, useState } from "react";
import {
  useSensors,
  useSensor,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import type { EditorContentType, MetaboxConfig } from "@/types/editor";
import {
  DEFAULT_POST_METABOXES,
  DEFAULT_PAGE_METABOXES,
} from "@/types/editor";

/** Metaboxes that require Editor+ role to see */
const EDITOR_ONLY_METABOXES = ["author"];

/** localStorage key pattern */
const LS_KEY_PREFIX = "convexpress_metabox_prefs_";

interface MetaboxPrefsStored {
  order: string[];
  collapsed: string[];
  hidden: string[];
}

function getStorageKey(contentType: EditorContentType): string {
  return `${LS_KEY_PREFIX}${contentType}`;
}

function loadPreferences(
  contentType: EditorContentType,
): MetaboxPrefsStored | null {
  try {
    const raw = localStorage.getItem(getStorageKey(contentType));
    if (!raw) return null;
    return JSON.parse(raw) as MetaboxPrefsStored;
  } catch {
    return null;
  }
}

function savePreferences(
  contentType: EditorContentType,
  prefs: MetaboxPrefsStored,
): void {
  try {
    localStorage.setItem(getStorageKey(contentType), JSON.stringify(prefs));
  } catch {
    // localStorage unavailable
  }
}

function isEditorOrAbove(role: string): boolean {
  return role === "editor" || role === "administrator";
}

interface UseMetaboxOrderOptions {
  contentType: EditorContentType;
  userRole: string;
}

export function useMetaboxOrder(options: UseMetaboxOrderOptions) {
  const { contentType, userRole } = options;

  const defaults =
    contentType === "post" ? DEFAULT_POST_METABOXES : DEFAULT_PAGE_METABOXES;

  const [metaboxes, setMetaboxes] = useState<MetaboxConfig[]>(() => {
    const prefs = loadPreferences(contentType);
    if (!prefs) return defaults;

    // Merge stored preferences with defaults
    // This handles the case where new metaboxes are added in future versions
    const orderedIds = prefs.order;
    const result: MetaboxConfig[] = [];
    const seen = new Set<string>();

    // First, add metaboxes in the stored order
    for (const id of orderedIds) {
      const def = defaults.find((m) => m.id === id);
      if (def) {
        result.push({
          ...def,
          isCollapsed: prefs.collapsed.includes(id),
          isVisible: !prefs.hidden.includes(id),
        });
        seen.add(id);
      }
    }

    // Then append any new metaboxes not in the stored order
    for (const def of defaults) {
      if (!seen.has(def.id)) {
        result.push(def);
      }
    }

    return result;
  });

  // Filter metaboxes by user role
  const visibleMetaboxes = useMemo(() => {
    return metaboxes.filter((m) => {
      if (EDITOR_ONLY_METABOXES.includes(m.id) && !isEditorOrAbove(userRole)) {
        return false;
      }
      return m.isVisible;
    });
  }, [metaboxes, userRole]);

  const persistPreferences = useCallback(
    (boxes: MetaboxConfig[]) => {
      const prefs: MetaboxPrefsStored = {
        order: boxes.map((m) => m.id),
        collapsed: boxes.filter((m) => m.isCollapsed).map((m) => m.id),
        hidden: boxes.filter((m) => !m.isVisible).map((m) => m.id),
      };
      savePreferences(contentType, prefs);
    },
    [contentType],
  );

  const moveMetabox = useCallback(
    (activeId: string, overId: string) => {
      setMetaboxes((prev) => {
        const activeIndex = prev.findIndex((m) => m.id === activeId);
        const overIndex = prev.findIndex((m) => m.id === overId);

        if (activeIndex === -1 || overIndex === -1) return prev;

        // Don't move non-draggable metaboxes (Publish box)
        if (!prev[activeIndex].isDraggable) return prev;

        const next = [...prev];
        const [moved] = next.splice(activeIndex, 1);
        next.splice(overIndex, 0, moved);

        persistPreferences(next);
        return next;
      });
    },
    [persistPreferences],
  );

  const toggleCollapse = useCallback(
    (metaboxId: string) => {
      setMetaboxes((prev) => {
        const next = prev.map((m) =>
          m.id === metaboxId ? { ...m, isCollapsed: !m.isCollapsed } : m,
        );
        persistPreferences(next);
        return next;
      });
    },
    [persistPreferences],
  );

  const toggleVisibility = useCallback(
    (metaboxId: string) => {
      setMetaboxes((prev) => {
        const next = prev.map((m) =>
          m.id === metaboxId ? { ...m, isVisible: !m.isVisible } : m,
        );
        persistPreferences(next);
        return next;
      });
    },
    [persistPreferences],
  );

  const resetToDefaults = useCallback(() => {
    setMetaboxes(defaults);
    try {
      localStorage.removeItem(getStorageKey(contentType));
    } catch {
      // localStorage unavailable
    }
  }, [defaults, contentType]);

  // @dnd-kit sensors: pointer with 8px activation distance, keyboard with sortable coordinates
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // DnD drag end handler
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      moveMetabox(String(active.id), String(over.id));
    },
    [moveMetabox],
  );

  // Sortable IDs for @dnd-kit SortableContext
  const sortableIds = useMemo(
    () => visibleMetaboxes.filter((m) => m.isDraggable).map((m) => m.id),
    [visibleMetaboxes],
  );

  return {
    metaboxes: visibleMetaboxes,
    allMetaboxes: metaboxes,
    moveMetabox,
    toggleCollapse,
    toggleVisibility,
    resetToDefaults,
    sensors,
    handleDragEnd,
    sortableIds,
  };
}
