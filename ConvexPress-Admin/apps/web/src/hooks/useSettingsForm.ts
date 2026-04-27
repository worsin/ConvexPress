/**
 * Core settings form hook.
 *
 * Connects Convex reactive data to TanStack Form with:
 * - Real Convex useQuery/useMutation (no placeholders)
 * - Dirty state tracking (deep comparison)
 * - Validation (Zod schema per section)
 * - Save / reset handlers
 * - Debounced autosave
 * - Concurrent edit detection (sync-during-render pattern, React 19)
 *
 * React 19 patterns used:
 * - Sync-from-props via "adjust state during render" instead of useEffect (A1)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import type { z } from "zod";

import { api } from "@backend/convex/_generated/api";
import type { SettingsSection } from "@/types/settings";
import { sectionDefaults } from "@/lib/settings/schemas";

// --- Deep equality helper ---

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }

    return true;
  }

  return false;
}

function cloneValues<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[key] = (val as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return val;
  });
}

/**
 * Extract settings values from Convex query result.
 * Strips Convex metadata (_id, _creationTime) and our own metadata
 * (updatedAt, updatedBy, section) to return only the user-editable fields.
 */
function stripMetadataFields(settingsData: Record<string, unknown>): Record<string, unknown> {
  const { _id, _creationTime, updatedAt, updatedBy, section: _section, ...values } = settingsData;
  return values;
}

const AUTOSAVE_DEBOUNCE_MS = 600;

export type SettingsAutosaveStatus =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "blocked"
  | "error";

// --- Hook ---

interface UseSettingsFormOptions {
  /**
   * When true, disables debounced autosave.
   * The caller must use `handleSave` for explicit saves.
   * Used for the permalinks section where changes require confirmation.
   */
  disableAutosave?: boolean;
}

export function useSettingsForm<T extends object>(
  section: SettingsSection,
  validationSchema: z.ZodTypeAny,
  options?: UseSettingsFormOptions,
) {
  const disableAutosave = options?.disableAutosave ?? false;
  // Real Convex subscription -- returns merged defaults + stored values
  const settingsData = useQuery(api.settings.queries.getBySection, { section });

  // Real Convex mutation for saving
  const updateSettings = useMutation(api.settings.mutations.updateSection);

  // Get defaults for this section
  const defaults = (sectionDefaults[section] ?? {}) as T;

  // Track initial values for dirty comparison
  const [initialValues, setInitialValues] = useState<T>(() => cloneValues(defaults));
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<SettingsAutosaveStatus>("idle");
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedAutosaveValuesJsonRef = useRef<string | null>(null);

  // Store the schema in a ref so it's stable across renders
  const schemaRef = useRef(validationSchema);
  schemaRef.current = validationSchema;

  // --- React 19: Adjust state during render instead of useEffect (Fix A1) ---
  //
  // Instead of a useEffect that fires *after* render to sync settingsData into
  // form state, we track the previous settingsData reference and update state
  // synchronously during render when it changes. This is the "adjust state
  // during render" pattern recommended by React docs:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  //
  // Benefits:
  // - No extra render cycle (useEffect fires after paint, causing a flash)
  // - No stale closure issues with isDirty
  // - Simpler data flow: props change -> state updates -> single render
  const prevSettingsJsonRef = useRef<string | null>(null);

  // Create TanStack Form instance
  const form = useForm<
    T,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    unknown
  >({
    defaultValues: initialValues,
  });

  // Compute dirty state from content, not object reference.
  const currentValues = useStore(form.store, (state) => state.values);
  const currentValuesJson = stableSerialize(currentValues);
  const isDirty = !deepEqual(currentValues, initialValues);

  // Loading state: settingsData is undefined while Convex query is in flight
  const isLoading = settingsData === undefined;

  // Sync server data during render (not in useEffect)
  if (settingsData) {
    const serverValues = stripMetadataFields(settingsData as Record<string, unknown>);
    const incomingJson = JSON.stringify(serverValues);

    if (prevSettingsJsonRef.current === null) {
      // First load -- initialize form with server data merged over defaults
      const values = { ...defaults, ...serverValues } as T;
      prevSettingsJsonRef.current = incomingJson;
      // setState during render is fine when conditioned on changed input
      setInitialValues(cloneValues(values));
      form.reset(cloneValues(values));
    } else if (incomingJson !== prevSettingsJsonRef.current) {
      // Data changed on server (another admin saved)
      prevSettingsJsonRef.current = incomingJson;

      // We read isDirty inline here because we need the *current* dirty state,
      // not a potentially stale closure value from a useEffect dependency array
      const currentlyDirty = !deepEqual(form.state.values, initialValues);

      if (!currentlyDirty) {
        // No local edits -- silently update
        const values = { ...defaults, ...serverValues } as T;
        setInitialValues(cloneValues(values));
        form.reset(cloneValues(values));
      } else {
        // User has unsaved changes -- warn but don't overwrite.
        // Toast is a side effect, so we schedule it rather than calling during render.
        queueMicrotask(() => {
          toast.info("Settings were updated by another administrator.");
        });
      }
    }
  }

  const persistValues = useCallback(
    async (
      values: T,
      options: { source: "manual" | "autosave" } = { source: "manual" },
    ): Promise<boolean> => {
      const result = schemaRef.current.safeParse(values);

      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const path = issue.path.join(".");
          if (path && !fieldErrors[path]) {
            fieldErrors[path] = issue.message;
          }
        }

        setValidationErrors(fieldErrors);

        if (options.source === "autosave") {
          setAutoSaveStatus("blocked");
          setAutoSaveError("Autosave paused until validation errors are fixed.");
          return false;
        }

        const errorCount = Object.keys(fieldErrors).length;
        toast.error(
          `Please fix ${errorCount} error${errorCount !== 1 ? "s" : ""} before saving.`,
        );

        // Focus the first field with a validation error (Fix #95)
        const firstErrorField = Object.keys(fieldErrors)[0];
        if (firstErrorField) {
          queueMicrotask(() => {
            const el =
              document.getElementById(firstErrorField) ??
              document.querySelector(`[name="${firstErrorField}"]`);
            if (el && "focus" in el) {
              (el as HTMLElement).focus();
              (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
            }
          });
        }

        return false;
      }

      setValidationErrors({});
      setAutoSaveError(null);
      setIsSubmitting(true);
      if (options.source === "autosave") {
        setAutoSaveStatus("saving");
      }

      try {
        await updateSettings({
          section,
          values: result.data as Record<string, unknown>,
        });

        setInitialValues(cloneValues(values));

        if (options.source === "autosave") {
          setAutoSaveStatus("saved");
        } else {
          toast.success("Settings saved.");
        }
        return true;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Failed to save settings.";

        if (options.source === "autosave") {
          setAutoSaveStatus("error");
          setAutoSaveError(message);
        } else {
          toast.error(message);
        }

        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [section, updateSettings],
  );

  // Save handler for explicit/manual save calls.
  // NOTE (Fix #157): currentValuesJson is intentionally in the dependency array
  // so that the callback identity changes when values change. This is needed by
  // downstream consumers (e.g., permalinks handleSaveClick) that memoize based
  // on handleSave's identity. The actual value is read from form.state.values
  // at call time, so it's always fresh regardless of closure staleness.
  const handleSave = useCallback(async () => {
    await persistValues(cloneValues(form.state.values), { source: "manual" });
  }, [currentValuesJson, persistValues]);

  // Debounced autosave on any dirty value changes.
  // Skipped entirely when disableAutosave is true (e.g., permalinks section).
  useEffect(() => {
    if (disableAutosave) return;
    if (isLoading || isSubmitting) return;

    if (!isDirty) {
      queuedAutosaveValuesJsonRef.current = null;
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (autoSaveStatus === "pending" || autoSaveStatus === "saving") {
        setAutoSaveStatus("idle");
      }
      return;
    }

    // A timer is already queued (or this value already attempted); do not re-queue.
    if (queuedAutosaveValuesJsonRef.current === currentValuesJson) {
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    queuedAutosaveValuesJsonRef.current = currentValuesJson;
    setAutoSaveStatus("pending");
    setAutoSaveError(null);

    // Snapshot values at schedule time to avoid race conditions.
    const snapshot = JSON.parse(currentValuesJson) as T;

    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void persistValues(snapshot, { source: "autosave" });
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [
    disableAutosave,
    autoSaveStatus,
    isDirty,
    isLoading,
    isSubmitting,
    currentValuesJson,
    persistValues,
  ]);

  // Clear pending timers when the component unmounts.
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, []);

  // Reset handler
  const handleReset = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setAutoSaveStatus("idle");
    setAutoSaveError(null);
    form.reset(cloneValues(initialValues));
  }, [form, initialValues]);

  return {
    form,
    isDirty,
    isSubmitting,
    isLoading,
    handleSave,
    handleReset,
    initialValues,
    validationErrors,
    autoSaveStatus,
    autoSaveError,
    lastUpdated: settingsData
      ? (() => {
          const metadata = settingsData as Record<string, unknown>;
          const at = metadata.updatedAt;
          const by = metadata.updatedBy;
          if (typeof at !== "number" || typeof by !== "string") {
            return undefined;
          }
          return { at, by };
        })()
      : undefined,
  };
}
