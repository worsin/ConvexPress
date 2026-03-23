import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import type { RegistrationMode } from "@/lib/auth/types";

/**
 * Registration status enum.
 *
 * "open"        -- Self-registration is enabled for everyone.
 * "invite_only" -- Registration requires an invitation token.
 * "closed"      -- Registration is completely disabled.
 *
 * NOTE: The current backend query (`isRegistrationOpen`) returns a simple
 * boolean. To properly distinguish "closed" from "invite_only", the backend
 * should return a structured enum (e.g., `{ status: "open" | "closed" | "invite_only" }`).
 * Until that backend change is made, this hook infers the status:
 *   - `true`  -> "open"
 *   - `false` -> "invite_only" (assumes invitations are always accepted when reg is off)
 *
 * TODO: Update when backend returns structured registration status.
 */
export type RegistrationStatus = "open" | "invite_only" | "closed";

interface UseRegistrationGateResult {
  isLoading: boolean;
  canRegister: boolean;
  isInviteOnly: boolean;
  registrationStatus: RegistrationStatus | undefined;
  registrationMode: RegistrationMode | undefined;
}

export function useRegistrationGate(): UseRegistrationGateResult {
  // Reactive subscription to the registration open/closed state.
  // This is a PUBLIC query -- no auth required.
  // Returns a boolean: true if self-registration is enabled.
  const isOpen = useQuery(api.registration.queries.isRegistrationOpen);

  return useMemo(() => {
    // Still loading from Convex
    if (isOpen === undefined) {
      return {
        isLoading: true,
        canRegister: false,
        isInviteOnly: false,
        registrationStatus: undefined,
        registrationMode: undefined,
      };
    }

    // Determine registration status from the boolean.
    // When the backend is updated to return a structured enum, replace this logic.
    const registrationStatus: RegistrationStatus = isOpen
      ? "open"
      : "invite_only"; // Cannot distinguish "closed" vs "invite_only" with boolean API

    const registrationMode: RegistrationMode = {
      open: isOpen,
      inviteOnly: registrationStatus === "invite_only",
      defaultRole: "subscriber",
    };

    return {
      isLoading: false,
      canRegister: registrationMode.open,
      isInviteOnly: registrationStatus === "invite_only",
      registrationStatus,
      registrationMode,
    };
  }, [isOpen]);
}
