/**
 * useAutosave - Debounced autosave logic
 *
 * Watches title and content for changes, debounces, and fires the Convex
 * posts.autosave mutation. Also fires on a periodic interval if there are
 * pending changes.
 *
 * Default debounce: 30 seconds (matching PRD/knowledge doc spec).
 * Configurable via Settings System: writing_settings.autosave_interval
 * Range: 10s (minimum) to 300s (maximum).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { AutosaveState } from "@/types/editor";

/** Default autosave debounce: 30 seconds (per PRD/knowledge doc spec) */
const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 30_000;
/** Minimum autosave interval: 10 seconds */
const MIN_AUTOSAVE_INTERVAL_MS = 10_000;
/** Maximum autosave interval: 300 seconds */
const MAX_AUTOSAVE_INTERVAL_MS = 300_000;
/** Default periodic interval: 60 seconds */
const DEFAULT_AUTOSAVE_PERIODIC_MS = 60_000;

interface UseAutosaveOptions {
  /** The post ID to autosave (null if auto-draft not yet created) */
  postId: string | null;
  /** Current title value */
  title: string;
  /** Current content value */
  content: string;
  /** Whether autosave is enabled */
  enabled: boolean;
  /**
   * Debounce delay in ms after typing stops.
   * Default: 30000 (30s per PRD spec).
   * Clamped to 10s-300s range per spec.
   * Can be overridden by Settings System: writing_settings.autosave_interval.
   */
  debounceMs?: number;
  /** Periodic interval in ms (default: 60000) */
  intervalMs?: number;
}

export function useAutosave(options: UseAutosaveOptions): AutosaveState {
  const {
    postId,
    title,
    content,
    enabled,
    debounceMs: rawDebounceMs,
    intervalMs = DEFAULT_AUTOSAVE_PERIODIC_MS,
  } = options;

  // Clamp debounce to spec range (10s - 300s), default 30s
  const debounceMs = Math.min(
    MAX_AUTOSAVE_INTERVAL_MS,
    Math.max(MIN_AUTOSAVE_INTERVAL_MS, rawDebounceMs ?? DEFAULT_AUTOSAVE_DEBOUNCE_MS),
  );

  // Convex autosave mutation
  const autosavePost = useMutation(api.posts.mutations.autosave);

  const [state, setState] = useState<AutosaveState>({
    status: "idle",
    lastSavedAt: null,
    error: null,
  });

  const lastSavedTitleRef = useRef(title);
  const lastSavedContentRef = useRef(content);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasChanges = useCallback(() => {
    return (
      title !== lastSavedTitleRef.current ||
      content !== lastSavedContentRef.current
    );
  }, [title, content]);

  const performAutosave = useCallback(async () => {
    if (!postId || !enabled) return;
    if (!hasChanges()) return;

    setState((prev) => ({ ...prev, status: "saving", error: null }));

    try {
      await autosavePost({
        postId: postId as Id<"posts">,
        title,
        content,
      });

      lastSavedTitleRef.current = title;
      lastSavedContentRef.current = content;

      setState({
        status: "saved",
        lastSavedAt: Date.now(),
        error: null,
      });

      // Reset to idle after 3 seconds
      setTimeout(() => {
        setState((prev) => {
          if (prev.status === "saved") {
            return { ...prev, status: "idle" };
          }
          return prev;
        });
      }, 3000);
    } catch (error: unknown) {
      setState({
        status: "error",
        lastSavedAt: null,
        error: error instanceof Error ? error.message : "Autosave failed",
      });
    }
  }, [postId, enabled, title, content, hasChanges, autosavePost]);

  // Debounced autosave on content/title change
  useEffect(() => {
    if (!enabled || !postId) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (hasChanges()) {
      debounceTimerRef.current = setTimeout(() => {
        performAutosave();
      }, debounceMs);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [title, content, enabled, postId, debounceMs, hasChanges, performAutosave]);

  // Periodic interval autosave
  useEffect(() => {
    if (!enabled || !postId) return;

    intervalTimerRef.current = setInterval(() => {
      if (hasChanges()) {
        performAutosave();
      }
    }, intervalMs);

    return () => {
      if (intervalTimerRef.current) {
        clearInterval(intervalTimerRef.current);
      }
    };
  }, [enabled, postId, intervalMs, hasChanges, performAutosave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
    };
  }, []);

  return state;
}
