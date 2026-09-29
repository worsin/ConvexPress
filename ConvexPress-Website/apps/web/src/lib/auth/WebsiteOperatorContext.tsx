import { createContext, useContext } from "react";
import { useConvexAuth } from "convex/react";
import { useCapabilityAccess } from "@/hooks/useCan";

export type WebsiteOperatorState = { active: boolean; expiresAt: number | null; pending: boolean; error: string | null; end: () => void; dismiss: () => void; reconnect(): void; canReconnect: boolean };
export const WebsiteOperatorContext = createContext<WebsiteOperatorState>({ active: false, expiresAt: null, pending: false, error: null, end() {}, dismiss() {}, reconnect() {}, canReconnect: false });
export const useWebsiteOperator = () => useContext(WebsiteOperatorContext);

export function WebsiteOperatorNotice() {
  const operator = useWebsiteOperator();
  const auth = useConvexAuth();
  const access = useCapabilityAccess("manage_options");
  const authorized = operator.active && !auth.isLoading && auth.isAuthenticated && access === "allowed";
  const denied = operator.active && !operator.pending && !auth.isLoading && (!auth.isAuthenticated || access === "denied");
  if (!operator.active && !operator.pending && !operator.error) return null;
  return <div role={operator.error || denied ? "alert" : "status"} className="relative z-50 flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background px-4 py-3 text-sm text-foreground">
    <span>{operator.error ?? (denied ? "Website editing access is no longer authorized. Reopen editing from ConvexPress after access is restored." : authorized ? "Website editing is active for this tab." : operator.active ? "Checking website editing access…" : "Opening website editing…")}</span>
    {operator.active && <button type="button" className="underline" onClick={operator.end}>End website editing</button>}
    {authorized && operator.expiresAt && <span className="text-xs">{operator.canReconnect ? "Keep ConvexPress open to renew editing access." : `Ends at ${new Date(operator.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Save a private draft to keep unpublished changes.`}</span>}
    {operator.canReconnect && (operator.error || denied) && <button type="button" className="underline" disabled={operator.pending} onClick={operator.reconnect}>{operator.pending ? "Reconnecting…" : "Reconnect editing"}</button>}
    {operator.error && <button type="button" className="underline" onClick={operator.dismiss}>Dismiss</button>}
  </div>;
}
