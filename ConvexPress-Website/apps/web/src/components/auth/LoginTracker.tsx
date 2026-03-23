/**
 * Login Tracker Component
 *
 * Invisible component that tracks login events for the website app.
 * Place this inside the component tree where both ConvexProvider and
 * ClerkProvider are available.
 *
 * Renders nothing -- purely a side-effect component.
 */

import { useLoginTracker } from "@/hooks/useLoginTracker";

export function LoginTracker() {
  useLoginTracker();
  return null;
}
