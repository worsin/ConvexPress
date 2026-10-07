import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createEditorRecoveryStore } from "./recovery-store";

const RecoveryContext = createContext<ReturnType<typeof createEditorRecoveryStore> | null>(null);
export const useEditorRecovery = () => useContext(RecoveryContext);

/** Scope excludes transient connection generations, but includes the operator,
 * connection, database origin, environment and broker-selected role. */
export function EditorRecoveryProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const store = useMemo(() => {
    let storage: Storage | null = null;
    try { if (typeof window !== "undefined") storage = window.localStorage; } catch { /* Editing remains available when device storage is blocked. */ }
    return createEditorRecoveryStore({ scope, storage });
  }, [scope]);
  return <RecoveryContext.Provider key={scope} value={store}>{children}</RecoveryContext.Provider>;
}
