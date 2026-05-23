import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth, useSignUp } from "@clerk/clerk-react";
import { Loader2, MailCheck, RotateCw, ShieldCheck } from "lucide-react";
import { z } from "zod";

import { AuthError } from "@/components/auth/AuthError";
import { AuthLink } from "@/components/auth/AuthLink";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clearPendingSubscriptionIntent,
  clearPendingVerificationContext,
  readPendingVerificationContext,
  writePendingVerificationContext,
} from "@/lib/auth/verification";
import { sanitizeRedirectUrl } from "@/lib/security/redirect";
import { buildRestrictedPageHead } from "@/lib/seo/head";

const verifyEmailSearchSchema = z.object({
  returnTo: z.string().optional(),
});

export const Route = createFileRoute("/verify-email")({
  validateSearch: verifyEmailSearchSchema,
  head: () => buildRestrictedPageHead({
    title: "Verify Email - ConvexPress",
    path: "/verify-email",
  }),
  component: VerifyEmailComponent,
});

function extractClerkErrorMessage(error: unknown) {
  const clerkError = error as {
    errors?: Array<{ message?: string; longMessage?: string }>;
  };

  return (
    clerkError?.errors?.[0]?.longMessage ??
    clerkError?.errors?.[0]?.message ??
    "We could not verify that code. Please try again."
  );
}

function VerifyEmailComponent() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signUp, setActive, isLoaded: signUpLoaded } = useSignUp();
  const { returnTo } = Route.useSearch();

  const [pendingContext] = useState(() => readPendingVerificationContext());
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const fallbackPath =
    pendingContext?.source === "subscription" && pendingContext.offerId
      ? `/signup/${pendingContext.offerId}`
      : "/dashboard";

  const safeReturnTo = sanitizeRedirectUrl(
    returnTo ?? pendingContext?.returnTo,
    { fallbackPath },
  );

  const isSubscriptionResume = pendingContext?.source === "subscription";
  const destinationLabel = isSubscriptionResume
    ? "continue your subscription signup"
    : "finish signing in";

  useEffect(() => {
    if (returnTo || pendingContext?.email || pendingContext?.offerId) {
      writePendingVerificationContext({
        ...pendingContext,
        returnTo: safeReturnTo,
      });
    }
  }, [pendingContext, returnTo, safeReturnTo]);

  useEffect(() => {
    if (!authLoaded || !isSignedIn) return;

    clearPendingSubscriptionIntent();
    if (!isSubscriptionResume) {
      clearPendingVerificationContext();
    }
    if (typeof window !== "undefined") {
      window.location.assign(safeReturnTo);
    }
  }, [authLoaded, isSignedIn, isSubscriptionResume, safeReturnTo]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!signUpLoaded || !signUp) {
      setError("Email verification is not ready yet. Please try again.");
      return;
    }

    if (!code.trim()) {
      setError("Enter the verification code from your email.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      });

      if (result.status === "complete") {
        clearPendingSubscriptionIntent();
        if (!isSubscriptionResume) {
          clearPendingVerificationContext();
        }
        await setActive({ session: result.createdSessionId });
        if (typeof window !== "undefined") {
          window.location.assign(safeReturnTo);
        }
        return;
      }

      setError(
        "Verification requires additional steps. Request a new code and try again.",
      );
    } catch (submitError: unknown) {
      setError(extractClerkErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    setError("");
    setNotice("");

    if (!signUpLoaded || !signUp) {
      setError("We could not resend the code yet. Please try again.");
      return;
    }

    setIsResending(true);
    try {
      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      });
      setNotice("A fresh verification code has been sent.");
    } catch (resendError: unknown) {
      setError(extractClerkErrorMessage(resendError));
    } finally {
      setIsResending(false);
    }
  }

  if (authLoaded && isSignedIn) {
    return null;
  }

  return (
    <AuthPageLayout
      title="Verify Your Email"
      description="Enter the code we emailed you to continue."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex size-10 items-center justify-center rounded-none bg-primary/10">
            <MailCheck className="size-4 text-primary" />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {pendingContext?.email
                ? `We sent a verification code to ${pendingContext.email}.`
                : "We sent a verification code to your email address."}
            </p>
            <p className="text-xs text-muted-foreground">
              Verify your email to {destinationLabel}.
            </p>
            {isSubscriptionResume && (
              <p className="text-xs text-muted-foreground">
                After verification, we will return you to your plan checkout so
                you can complete payment while signed in.
              </p>
            )}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          {error ? <AuthError message={error} /> : null}

          {notice ? (
            <div className="border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
              {notice}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="verify-email-code">Verification code</Label>
            <Input
              id="verify-email-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(nextEvent) => {
                setCode(nextEvent.target.value);
                if (error) setError("");
              }}
              maxLength={8}
              autoFocus
              required
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isSubmitting || !signUpLoaded}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <ShieldCheck className="size-4" />
                Verify Email
              </>
            )}
          </Button>
        </form>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleResend}
          disabled={isResending || !signUpLoaded}
        >
          {isResending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <RotateCw className="size-4" />
              Send New Code
            </>
          )}
        </Button>

        <div className="space-y-1 text-center">
          <p className="text-xs text-muted-foreground">
            If you refreshed this page and your verification session was lost,
            start the signup flow again.
          </p>
          <div className="flex items-center justify-center gap-3 text-xs">
            <AuthLink to="/register">Create account</AuthLink>
            <AuthLink to="/login">Sign in instead</AuthLink>
          </div>
        </div>
      </div>
    </AuthPageLayout>
  );
}
