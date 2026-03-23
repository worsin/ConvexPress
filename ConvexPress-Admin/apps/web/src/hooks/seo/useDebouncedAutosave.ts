import { useEffect, useRef, useState } from "react";

export type DebouncedAutosaveStatus =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "error";

interface UseDebouncedAutosaveOptions {
  enabled: boolean;
  signature: string;
  onSave: () => Promise<void>;
  debounceMs?: number;
}

export function useDebouncedAutosave({
  enabled,
  signature,
  onSave,
  debounceMs = 600,
}: UseDebouncedAutosaveOptions) {
  const [status, setStatus] = useState<DebouncedAutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAttemptedSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (lastAttemptedSignatureRef.current === signature) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setStatus("pending");
    setError(null);

    const snapshot = signature;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      lastAttemptedSignatureRef.current = snapshot;
      setStatus("saving");
      void onSave()
        .then(() => {
          setStatus("saved");
        })
        .catch((cause) => {
          setStatus("error");
          setError(cause instanceof Error ? cause.message : "Autosave failed");
        });
    }, debounceMs);
  }, [debounceMs, enabled, onSave, signature]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return {
    status,
    error,
  };
}
