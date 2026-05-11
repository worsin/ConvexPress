/**
 * Post System - Autosave Hook
 *
 * Provides debounced autosave functionality for the post editor.
 * Calls the posts.autosave mutation without updating `updatedAt`
 * or creating revisions.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

/** Autosave interval: 60 seconds. */
const AUTOSAVE_INTERVAL_MS = 60 * 1000;

/** Debounce after typing stops: 2 seconds. */
const DEBOUNCE_MS = 2000;

export interface AutosaveState {
  status: "idle" | "saving" | "saved" | "error";
  lastSavedAt: number | null;
}

interface UsePostAutosaveParams {
  postId: Id<"posts"> | null;
  title: string;
  content: string;
  /** Disable autosave (e.g., when post is not yet created). */
  disabled?: boolean;
}

/**
 * Hook for debounced autosave of post content.
 *
 * Saves every 60 seconds or 2 seconds after typing stops.
 * Does not trigger events or update the post's `updatedAt`.
 */
export function usePostAutosave({
  postId,
  title,
  content,
  disabled = false,
}: UsePostAutosaveParams) {
  const autosaveMutation = useMutation(api.posts.mutations.autosave);
  const [state, setState] = useState<AutosaveState>({
    status: "idle",
    lastSavedAt: null,
  });

  const lastValuesRef = useRef({ title: "", content: "" });
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doAutosave = useCallback(async () => {
    if (!postId || disabled) return;

    // Check if values actually changed
    const prev = lastValuesRef.current;
    if (title === prev.title && content === prev.content) return;

    setState((s) => ({ ...s, status: "saving" }));

    try {
      const result = await autosaveMutation({
        postId,
        title: title !== prev.title ? title : undefined,
        content: content !== prev.content ? content : undefined,
      });

      lastValuesRef.current = { title, content };
      setState({
        status: "saved",
        lastSavedAt: result.autosavedAt || Date.now(),
      });
    } catch {
      setState((s) => ({ ...s, status: "error" }));
    }
  }, [postId, title, content, disabled, autosaveMutation]);

  // Debounce on content/title change
  useEffect(() => {
    if (disabled || !postId) return;

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer (2s after typing stops)
    debounceTimerRef.current = setTimeout(() => {
      doAutosave();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [title, content, doAutosave, disabled, postId]);

  // Periodic autosave (every 60s)
  useEffect(() => {
    if (disabled || !postId) return;

    intervalTimerRef.current = setInterval(() => {
      doAutosave();
    }, AUTOSAVE_INTERVAL_MS);

    return () => {
      if (intervalTimerRef.current) {
        clearInterval(intervalTimerRef.current);
      }
    };
  }, [doAutosave, disabled, postId]);

  return state;
}
