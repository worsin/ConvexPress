import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { useDebouncedAutosave, type DebouncedAutosaveStatus } from "@/hooks/useDebouncedAutosave";

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(value);
}

interface UseSettingsAutosaveDraftOptions<TDraft extends object, TSource> {
  source: TSource | null | undefined;
  createDraft: (source: TSource) => TDraft;
  onSave: (draft: TDraft) => Promise<void>;
  debounceMs?: number;
}

interface UseSettingsAutosaveDraftResult<TDraft extends object> {
  draft: TDraft | null;
  setDraft: Dispatch<SetStateAction<TDraft | null>>;
  discardChanges: () => void;
  isDirty: boolean;
  autosaveStatus: DebouncedAutosaveStatus;
  autosaveError: string | null;
  isReady: boolean;
}

export function useSettingsAutosaveDraft<
  TDraft extends object,
  TSource extends Record<string, unknown>,
>({
  source,
  createDraft,
  onSave,
  debounceMs,
}: UseSettingsAutosaveDraftOptions<TDraft, TSource>): UseSettingsAutosaveDraftResult<TDraft> {
  const [draft, setDraft] = useState<TDraft | null>(null);
  const [savedDraft, setSavedDraft] = useState<TDraft | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (source === undefined || source === null) {
      return;
    }

    const nextDraft = cloneValue(createDraft(source));

    if (!initialized || draft === null || savedDraft === null) {
      setDraft(nextDraft);
      setSavedDraft(nextDraft);
      setInitialized(true);
      return;
    }

    const serverJson = stableSerialize(nextDraft);
    const savedJson = stableSerialize(savedDraft);
    const draftJson = stableSerialize(draft);

    if (serverJson !== savedJson) {
      setSavedDraft(nextDraft);
      if (draftJson === savedJson) {
        setDraft(nextDraft);
      }
    }
  }, [createDraft, draft, initialized, savedDraft, source]);

  const { isDirty, status, error } = useDebouncedAutosave({
    value: draft ?? ({} as TDraft),
    baseline: savedDraft ?? ({} as TDraft),
    isReady: initialized && draft !== null && savedDraft !== null,
    debounceMs,
    onSave: async (nextDraft) => {
      await onSave(nextDraft);
      setSavedDraft(cloneValue(nextDraft));
    },
  });

  const discardChanges = useCallback(() => {
    if (savedDraft === null) {
      return;
    }
    setDraft(cloneValue(savedDraft));
  }, [savedDraft]);

  return {
    draft,
    setDraft,
    discardChanges,
    isDirty,
    autosaveStatus: status,
    autosaveError: error,
    isReady: initialized && draft !== null,
  };
}
