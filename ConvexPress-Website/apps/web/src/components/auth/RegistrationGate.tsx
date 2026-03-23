import * as React from "react";

import { useRegistrationGate } from "@/hooks/useRegistrationGate";
import { useInvitationValidation } from "@/hooks/useInvitationValidation";
import { RegistrationClosedMessage } from "./RegistrationClosedMessage";
import { InvitationRequiredMessage } from "./InvitationRequiredMessage";
import { InvitationInvalidMessage } from "./InvitationInvalidMessage";
import { InvitationBanner } from "./InvitationBanner";

interface RegistrationGateProps {
  token?: string;
  children: React.ReactNode;
}

/**
 * Wrapper component that checks registration mode and conditionally renders
 * the registration form, a closed message, or invitation validation.
 *
 * Subscribes to Convex reactive queries for real-time updates. If an admin
 * disables registration while a user is on the page, the form is replaced
 * with a "Registration Closed" message automatically.
 *
 * When an invitation token is present and valid, the InvitationBanner is
 * rendered above the form children to show "You've been invited as {role}".
 */
export function RegistrationGate({ token, children }: RegistrationGateProps) {
  const { isLoading: gateLoading, canRegister, isInviteOnly } =
    useRegistrationGate();
  const {
    isLoading: invitationLoading,
    invitation,
    isValid: invitationValid,
    invalidReason,
  } = useInvitationValidation(token);

  // Loading state
  if (gateLoading || (token && invitationLoading)) {
    return (
      <div
        data-slot="registration-gate-loading"
        className="flex flex-col gap-3"
      >
        <div className="h-4 w-3/4 animate-pulse rounded-none bg-muted" />
        <div className="h-8 w-full animate-pulse rounded-none bg-muted" />
        <div className="h-8 w-full animate-pulse rounded-none bg-muted" />
        <div className="h-8 w-full animate-pulse rounded-none bg-muted" />
        <div className="h-8 w-full animate-pulse rounded-none bg-muted" />
      </div>
    );
  }

  // Helper to wrap children with InvitationBanner when invitation data exists
  const renderWithBanner = () => (
    <>
      {invitation && <InvitationBanner invitation={invitation} />}
      {children}
    </>
  );

  // Registration is open -- show the form
  if (canRegister) {
    return renderWithBanner();
  }

  // Invitation-only mode
  if (isInviteOnly) {
    // Has token but invalid
    if (token && !invitationValid && invalidReason) {
      return <InvitationInvalidMessage reason={invalidReason} />;
    }

    // Has valid token -- show the form with invitation banner
    if (token && invitationValid) {
      return renderWithBanner();
    }

    // No token
    return <InvitationRequiredMessage />;
  }

  // Registration is closed
  return <RegistrationClosedMessage />;
}
