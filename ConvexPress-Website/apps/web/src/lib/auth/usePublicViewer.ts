import { useAuth } from "./clerk";
import { useWebsiteOperator } from "./WebsiteOperatorContext";
import { getSiteRuntime } from "../site-runtime";

/** Identity expected by public reads on the active Convex provider. This is
 * binding metadata, never an authorization grant: consumers still wait for
 * Convex acknowledgement and validate the server's viewer-bound response.
 * Customer hooks deliberately continue to expose only the Clerk identity. */
export function usePublicViewer() {
  const customer = useAuth(), operator = useWebsiteOperator();
  if (!operator.active) return { ...customer, kind: "customer" as const, unavailable: false };
  const subject = operator.instanceKey === getSiteRuntime().instanceKey ? operator.viewerSubject : null;
  return {
    kind: "operator" as const,
    isLoaded: true,
    isSignedIn: true,
    userId: subject ?? null,
    sessionId: subject ?? null,
    unavailable: !subject,
  };
}
