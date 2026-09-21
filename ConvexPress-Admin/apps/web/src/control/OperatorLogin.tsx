/**
 * Operator sign-in for the standalone control plane.
 *
 * Two modes: sign in with an existing outer login, or claim a provisioned
 * invitation (email + one-time code + new password). Website customer logins
 * never come through here.
 */

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { AuthError, AuthScreen } from "@/components/auth/AuthScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ControlAuthClient } from "./auth-client";
import { claimControlInvitation, signInControlOperator } from "./auth-client";

export function OperatorLogin({ authClient, initialError }: { authClient: ControlAuthClient; initialError?: string }) {
  const [mode, setMode] = useState<"sign-in" | "claim">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [claimSecret, setClaimSecret] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState(false);
  const claim = mode === "claim";

  return (
    <AuthScreen
      eyebrow="Operator access"
      title={claim ? "Claim your invitation" : "Sign in to ConvexPress"}
      description={
        claim
          ? "Use the exact email your ConvexPress administrator provisioned. This creates only your outer multisite operator login."
          : "This account controls which businesses and websites you may open. Website customer logins remain separate."
      }
      footnote="Website customer logins are separate and stay inside each site."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setError(null);
          const request = claim
            ? claimControlInvitation(authClient, email, password, name, claimSecret)
            : signInControlOperator(authClient, email, password);
          void request
            .catch(() =>
              setError(
                claim
                  ? "That invitation could not be claimed. Use the exact provisioned email, one-time invitation code, and a new password of at least eight characters."
                  : "The email or password was not accepted.",
              ),
            )
            .finally(() => setPending(false));
        }}
      >
        {error ? <AuthError>{error}</AuthError> : null}

        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="control-email">Email</Label>
            <Input
              id="control-email"
              autoComplete="username"
              autoFocus
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="h-10"
            />
          </div>

          {claim ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="control-name">Name</Label>
                <Input
                  id="control-name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="control-claim-secret">Invitation code</Label>
                <Input
                  id="control-claim-secret"
                  autoComplete="one-time-code"
                  value={claimSecret}
                  onChange={(event) => setClaimSecret(event.target.value)}
                  required
                  className="h-10 font-mono text-[13px]"
                />
              </div>
            </>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="control-password">Password</Label>
            <Input
              id="control-password"
              autoComplete={claim ? "new-password" : "current-password"}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="h-10"
            />
          </div>
        </div>

        <Button className="mt-6 h-10 w-full text-[13.5px]" disabled={pending} type="submit">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending
            ? claim
              ? "Claiming invitation"
              : "Signing in"
            : claim
              ? "Claim invitation"
              : "Continue"}
        </Button>

        <button
          className="mt-5 w-full text-[13px] font-medium text-ink-2 underline-offset-4 hover:text-foreground hover:underline"
          type="button"
          onClick={() => {
            setError(null);
            setMode((value) => (value === "sign-in" ? "claim" : "sign-in"));
          }}
        >
          {claim ? "Return to sign in" : "Have an operator invitation? Claim it"}
        </button>
      </form>
    </AuthScreen>
  );
}
