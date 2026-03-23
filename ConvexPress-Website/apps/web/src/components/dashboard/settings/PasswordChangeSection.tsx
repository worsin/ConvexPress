import { ExternalLink, KeyRound, Info } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import type { UserProfile } from "@/lib/dashboard/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardCard } from "../DashboardCard";
import { PasswordLastChanged } from "../../password/PasswordLastChanged";

interface PasswordChangeSectionProps {
  user: UserProfile;
}

/**
 * Password management section within Account Settings.
 *
 * Displays:
 *   - Last password changed date (from getPasswordStatus query)
 *   - "Change Password" or "Add Password" button depending on OAuth status
 *   - OAuth notice for users who signed in with an external provider
 *
 * Links to the forgot-password flow for password changes.
 */
export function PasswordChangeSection(_props: PasswordChangeSectionProps) {
  const passwordStatus = useQuery(api.password.queries.getPasswordStatus, {});

  const handleChangePassword = () => {
    // Redirect to the forgot-password flow for password management.
    // Clerk handles the password reset flow securely.
    window.location.href = "/forgot-password";
  };

  // Determine if this is an OAuth-only user (no password set).
  //
  // Conservative heuristic: We only show the OAuth-only notice when
  // passwordResetRequestedAt is also null, meaning the user has never
  // attempted any password-related action. A user who registered with
  // email/password but never changed their password will still have
  // a passwordResetRequestedAt of null, but they at least completed
  // the email/password registration flow, so we default to showing
  // "Change Password" rather than "Add Password" to be safe.
  //
  // Future improvement: Use a direct password_enabled check
  // from the user profile data when available.
  const isOAuthOnly =
    passwordStatus &&
    passwordStatus.lastPasswordChangedAt === null &&
    passwordStatus.passwordResetRequestedAt === null &&
    passwordStatus.passwordResetCount === 0;

  return (
    <DashboardCard title="Password">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Your password is managed securely by our authentication provider.
        </p>

        {/* Password Status */}
        {passwordStatus === undefined ? (
          <Skeleton className="h-4 w-48" />
        ) : passwordStatus !== null ? (
          <PasswordLastChanged
            lastPasswordChangedAt={passwordStatus.lastPasswordChangedAt}
          />
        ) : null}

        {/* OAuth Notice */}
        {isOAuthOnly && (
          <div className="flex items-start gap-2 rounded-none border border-border bg-muted/50 p-3">
            <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              You signed in with an external provider. You can add a password
              to enable email/password login as well.
            </p>
          </div>
        )}

        {/* Change / Add Password Button */}
        <Button variant="outline" size="sm" onClick={handleChangePassword}>
          <KeyRound className="size-3.5" />
          <span>{isOAuthOnly ? "Add Password" : "Change Password"}</span>
          <ExternalLink className="size-3" />
        </Button>
      </div>
    </DashboardCard>
  );
}
