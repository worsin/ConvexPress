import { useEffect, useMemo, useRef, useState } from "react";

export type DebouncedAutosaveStatus =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "blocked"
  | "error";

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

interface UseDebouncedAutosaveOptions<T> {
  value: T;
  baseline: T;
  isReady?: boolean;
  disabled?: boolean;
  debounceMs?: number;
  onSave: (value: T) => Promise<void>;
}

/**
 * Lightweight autosave controller for settings pages that are not using the
 * TanStack Form-backed settings hook yet.
 */
export function useDebouncedAutosave<T>({
  value,
  baseline,
  isReady = true,
  disabled = false,
  debounceMs = 600,
  onSave,
}: UseDebouncedAutosaveOptions<T>) {
  const [status, setStatus] = useState<DebouncedAutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedValueJsonRef = useRef<string | null>(null);

  const valueJson = useMemo(() => stableSerialize(value), [value]);
  const baselineJson = useMemo(() => stableSerialize(baseline), [baseline]);
  const isDirty = valueJson !== baselineJson;

  useEffect(() => {
    if (disabled || !isReady) {
      return;
    }

    if (!isDirty) {
      queuedValueJsonRef.current = null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (status === "pending" || status === "saving") {
        setStatus("saved");
      } else if (status === "blocked") {
        setStatus("idle");
      }
      return;
    }

    if (queuedValueJsonRef.current === valueJson) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    queuedValueJsonRef.current = valueJson;
    setStatus("pending");
    setError(null);

    const snapshot = JSON.parse(valueJson) as T;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setStatus("saving");

      void onSave(snapshot)
        .then(() => {
          setStatus("saved");
          setError(null);
        })
        .catch((saveError: unknown) => {
          const message =
            saveError instanceof Error
              ? saveError.message
              : "Autosave failed.";
          setStatus("error");
          setError(message);
        });
    }, debounceMs);
  }, [baselineJson, debounceMs, disabled, isDirty, isReady, onSave, status, valueJson]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    isDirty,
    status,
    error,
  };
}
