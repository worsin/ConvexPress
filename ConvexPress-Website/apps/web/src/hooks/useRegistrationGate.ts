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
 * Backed by `registration.queries.getRegistrationStatus`, which distinguishes
 * fully closed registration from invite-only registration.
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
  const statusResult = useQuery(
    (api as any).registration.queries.getRegistrationStatus,
  ) as
    | {
        status: RegistrationStatus;
        canRegister: boolean;
        inviteOnly: boolean;
        defaultRole: string;
      }
    | undefined;

  return useMemo(() => {
    // Still loading from Convex
    if (statusResult === undefined) {
      return {
        isLoading: true,
        canRegister: false,
        isInviteOnly: false,
        registrationStatus: undefined,
        registrationMode: undefined,
      };
    }

    const registrationStatus = statusResult.status;

    const registrationMode: RegistrationMode = {
      open: statusResult.canRegister,
      inviteOnly: statusResult.inviteOnly,
      defaultRole: statusResult.defaultRole,
    };

    return {
      isLoading: false,
      canRegister: registrationMode.open,
      isInviteOnly: registrationStatus === "invite_only",
      registrationStatus,
      registrationMode,
    };
  }, [statusResult]);
}
