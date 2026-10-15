/**
 * Account step — create an account or sign in without leaving the page.
 *
 * Used where a purchase needs the buyer's account before it can finish: a
 * form that asks for an account at the end (`FormAccountStep`) and the direct
 * signup page. Creating an account verifies the email in place (code, or
 * link). Signing in handles every factor the site's Clerk setup uses. Once the
 * session is active and the site's account exists (`useEnsureCustomerAccount`),
 * `onReady` runs.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { AuthError } from "@/components/auth/AuthError";
import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Button } from "@/components/ui/button";
import { useEnsureCustomerAccount } from "@/hooks/useEnsureCustomerAccount";
import { useAuth, useClerk } from "@/lib/auth/clerk";

export interface AccountPrefill {
  emailAddress?: string;
  firstName?: string;
  lastName?: string;
}

export interface AccountStepProps {
  prefill: AccountPrefill;
  /** Where a redirect-based step (social sign-in, some links) returns to. */
  returnTo: string;
  onReady: () => void;
  onBack?: () => void;
  /** Under the heading while signed out ("Your answers are saved. …"). */
  intro: string;
  /** Under the heading while the account is being finished. */
  signedInIntro: string;
  /** The back link's text, when `onBack` is given. */
  backLabel?: string;
  /** The create button's text. */
  createLabel?: string;
}

const UNAVAILABLE_COPY: Record<"registration_closed" | "email_conflict" | "email_unverified" | "local_account" | "error", string> = {
  registration_closed: "New accounts can't be created on this site right now. Contact us to finish signing up.",
  email_conflict: "That email already belongs to another account here. Sign in with it instead, or use a different email.",
  email_unverified: "Verify your email address to continue. Check your inbox for the code we sent.",
  local_account: "That email belongs to an existing account. Sign in with it to continue.",
  error: "We couldn't set up your account. Please try again in a moment.",
};

export function AccountStep({
  prefill,
  returnTo,
  onReady,
  onBack,
  intro,
  signedInIntro,
  backLabel = "Back",
  createLabel = "Create account and continue",
}: AccountStepProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const account = useEnsureCustomerAccount();
  const [mode, setMode] = useState<"create" | "sign_in">("create");
  const reported = useRef(false);

  useEffect(() => {
    if (account.status !== "ready" || reported.current) return;
    reported.current = true;
    onReady();
  }, [account.status, onReady]);

  const signedIn = isLoaded && isSignedIn === true;

  return (
    <section data-slot="account-step" aria-labelledby="account-step-heading" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="account-step-heading" className="text-lg font-semibold text-foreground">
          {signedIn ? "Finishing up" : mode === "create" ? "Create your account" : "Sign in to continue"}
        </h2>
        <p className="text-sm text-muted-foreground">{signedIn ? signedInIntro : intro}</p>
      </div>

      {!isLoaded ? (
        <Progress message="Loading…" />
      ) : signedIn ? (
        account.status === "unavailable" ? (
          <div className="flex flex-col gap-3">
            <AuthError message={UNAVAILABLE_COPY[account.reason]} />
            <Button type="button" variant="outline" onClick={() => void signOut()}>
              Use a different account
            </Button>
          </div>
        ) : (
          <Progress message="Setting up your account…" />
        )
      ) : mode === "create" ? (
        <RegisterForm
          returnTo={returnTo}
          initialValues={prefill}
          submitLabel={createLabel}
          onSignedIn={() => undefined}
          onSwitchToSignIn={() => setMode("sign_in")}
        />
      ) : (
        <LoginForm
          returnTo={returnTo}
          initialIdentifier={prefill.emailAddress}
          onSignedIn={() => undefined}
          onSwitchToRegister={() => setMode("create")}
        />
      )}

      {onBack && !signedIn ? (
        <button type="button" onClick={onBack} className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {backLabel}
        </button>
      ) : null}
    </section>
  );
}

function Progress({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
