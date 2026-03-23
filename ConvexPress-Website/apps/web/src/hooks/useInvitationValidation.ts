import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import type { InvitationData } from "@/lib/auth/types";

interface UseInvitationValidationResult {
  isLoading: boolean;
  invitation: InvitationData | null;
  isValid: boolean;
  invalidReason: "expired" | "revoked" | "not_found" | "already_used" | null;
}

export function useInvitationValidation(
  token: string | undefined,
): UseInvitationValidationResult {
  // PUBLIC query -- no auth required.
  // Returns { email, role, message, expiresAt } for valid pending invitations,
  // or null for invalid/expired/revoked/not-found tokens.
  // Uses "skip" sentinel when no token is provided.
  const rawInvitation = useQuery(
    api.registration.queries.getByToken,
    token ? { token } : "skip",
  );

  return useMemo(() => {
    // No token provided -- not an invitation flow
    if (!token) {
      return {
        isLoading: false,
        invitation: null,
        isValid: false,
        invalidReason: null,
      };
    }

    // Still loading from Convex
    if (rawInvitation === undefined) {
      return {
        isLoading: true,
        invitation: null,
        isValid: false,
        invalidReason: null,
      };
    }

    // Token lookup returned null -- invitation not found, expired, revoked, or already used.
    // The public query returns null for all invalid states to avoid leaking info.
    if (rawInvitation === null) {
      return {
        isLoading: false,
        invitation: null,
        isValid: false,
        invalidReason: "not_found",
      };
    }

    // Build InvitationData from the safe subset returned by getByToken.
    // If we got a result, it means status is "pending" and not expired.
    const invitation: InvitationData = {
      email: rawInvitation.email,
      role: rawInvitation.role,
      message: rawInvitation.message ?? undefined,
      expiresAt: rawInvitation.expiresAt,
      status: "pending",
    };

    // Double-check expiry client-side (belt-and-suspenders)
    if (invitation.expiresAt < Date.now()) {
      return {
        isLoading: false,
        invitation,
        isValid: false,
        invalidReason: "expired",
      };
    }

    // Valid invitation
    return {
      isLoading: false,
      invitation,
      isValid: true,
      invalidReason: null,
    };
  }, [token, rawInvitation]);
}
