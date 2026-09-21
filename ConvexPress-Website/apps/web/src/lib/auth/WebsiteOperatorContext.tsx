import { createContext, useContext } from "react";

export type WebsiteOperatorState = { active: boolean; expiresAt: number | null; pending: boolean; error: string | null; end: () => void; dismiss: () => void };
export const WebsiteOperatorContext = createContext<WebsiteOperatorState>({ active: false, expiresAt: null, pending: false, error: null, end() {}, dismiss() {} });
export const useWebsiteOperator = () => useContext(WebsiteOperatorContext);

export function WebsiteOperatorNotice() {
  const operator = useWebsiteOperator();
  if (!operator.active && !operator.pending && !operator.error) return null;
  return <div role={operator.error ? "alert" : "status"} className="relative z-50 flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background px-4 py-3 text-sm text-foreground">
    <span>{operator.error ?? (operator.active ? "Website editing is active for this tab." : "Opening website editing…")}</span>
    {operator.active && <button type="button" className="underline" onClick={operator.end}>End website editing</button>}
    {operator.active && operator.expiresAt && <span className="text-xs">Ends at {new Date(operator.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Save a private draft to keep unpublished changes.</span>}
    {operator.error && <button type="button" className="underline" onClick={operator.dismiss}>Dismiss</button>}
  </div>;
}
