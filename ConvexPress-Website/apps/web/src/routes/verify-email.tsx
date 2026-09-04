import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, MailCheck, RotateCw, ShieldCheck } from "lucide-react";
import { z } from "zod";

import { AuthError } from "@/components/auth/AuthError";
import { AuthLink } from "@/components/auth/AuthLink";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { CodeInput } from "@/components/auth/CodeInput";
import { LegalConsent } from "@/components/auth/LegalConsent";
import { SignUpFields, emptySignUpValues, missingRequiredFields, type SignUpFieldValues } from "@/components/auth/SignUpFields";
import { Button } from "@/components/ui/button";
import { useAuthCapabilities } from "@/contexts/AuthConfigContext";
import { useSignUpFlow } from "@/hooks/useSignUpFlow";
import { useAuth } from "@/lib/auth/clerk";
import { passwordPolicyErrors, type SignUpFieldName } from "@/lib/auth/capabilities";
import type { SignUpNext } from "@/lib/auth/clerk-flow";
import {
  clearPendingSubscriptionIntent,
  clearPendingVerificationContext,
  readPendingVerificationContext,
  writePendingVerificationContext,
} from "@/lib/auth/verification";
import { sanitizeRedirectUrl } from "@/lib/security/redirect";
import { buildRestrictedPageHead, siteTitled } from "@/lib/seo/head";

const verifyEmailSearchSchema = z.object({
  returnTo: z.string().optional(),
});

export const Route = createFileRoute("/verify-email")({
  validateSearch: verifyEmailSearchSchema,
  head: () => buildRestrictedPageHead({ title: siteTitled("Verify Email"), path: "/verify-email" }),
  component: VerifyEmailComponent,
});

type Step =
  | { kind: "email_code" }
  | { kind: "email_link" }
  | { kind: "phone_code" }
  | { kind: "collect"; fields: SignUpFieldName[]; consent: boolean }
  | { kind: "done" };

/**
 * Verify email — and whatever Clerk asks for after it.
 *
 * Handles the emailed code, the emailed link (this page polls until the link
 * is opened), a phone code, and any fields Clerk still needs once the email is
 * verified (username, names, consent), so no configuration dead-ends here.
 */
function VerifyEmailComponent() {
  const capabilities = useAuthCapabilities();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const flow = useSignUpFlow();
  const { returnTo } = Route.useSearch();

  const [pendingContext] = useState(() => readPendingVerificationContext());
  const [code, setCode] = useState("");
  const [values, setValues] = useState<SignUpFieldValues>(emptySignUpValues);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [step, setStep] = useState<Step>(() =>
    pendingContext?.strategy === "email_link" ? { kind: "email_link" } : { kind: "email_code" },
  );

  const fallbackPath =
    pendingContext?.source === "subscription" && pendingContext.offerId ? `/signup/${pendingContext.offerId}` : "/dashboard";
  const safeReturnTo = sanitizeRedirectUrl(returnTo ?? pendingContext?.returnTo, { fallbackPath });
  const isSubscriptionResume = pendingContext?.source === "subscription";
  const destinationLabel = isSubscriptionResume ? "continue your subscription signup" : "finish signing in";

  useEffect(() => {
    if (returnTo || pendingContext?.email || pendingContext?.offerId) {
      writePendingVerificationContext({ ...pendingContext, returnTo: safeReturnTo });
    }
  }, [pendingContext, returnTo, safeReturnTo]);

  const finish = () => {
    clearPendingSubscriptionIntent();
    if (!isSubscriptionResume) clearPendingVerificationContext();
    if (typeof window !== "undefined") window.location.assign(safeReturnTo);
  };

  useEffect(() => {
    if (!authLoaded || !isSignedIn) return;
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoaded, isSignedIn]);

  // Pick up where Clerk says we are (e.g. reload mid-flow).
  useEffect(() => {
    if (!flow.isLoaded) return;
    const current = flow.current();
    if (!current) return;
    void applyNext(current, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.isLoaded]);

  // Email link: poll until the link is opened elsewhere.
  useEffect(() => {
    if (step.kind !== "email_link" || !flow.isLoaded) return;
    const timer = setInterval(async () => {
      try {
        const next = await flow.refresh();
        if (next.kind !== "verify_email") await applyNext(next, { silent: true });
      } catch {
        // keep polling
      }
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind, flow.isLoaded]);

  async function applyNext(next: SignUpNext, options: { silent?: boolean } = {}) {
    switch (next.kind) {
      case "complete":
        setStep({ kind: "done" });
        await flow.complete(next.sessionId);
        finish();
        return;
      case "verify_email":
        setStep({ kind: next.strategy === "email_link" ? "email_link" : "email_code" });
        return;
      case "verify_phone":
        setStep({ kind: "phone_code" });
        setCode("");
        return;
      case "collect":
        setStep({ kind: "collect", fields: next.fields, consent: false });
        return;
      case "legal_consent":
        setStep({ kind: "collect", fields: [], consent: true });
        return;
      case "restricted":
        setError("Sign-ups are currently limited on this site. Ask the site owner for an invitation.");
        return;
      case "abandoned":
        setError("This sign-up expired. Start again from the registration page.");
        return;
      default:
        if (!options.silent) setError("Verification requires an additional step we could not determine. Request a new code and try again.");
    }
  }

  async function handleSubmitCode(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!flow.isLoaded) return setError("Email verification is not ready yet. Please try again.");
    if (!code.trim()) return setError("Enter the verification code from your message.");
    setIsSubmitting(true);
    try {
      const next = step.kind === "phone_code" ? await flow.attemptPhoneCode(code) : await flow.attemptEmailCode(code);
      await applyNext(next);
    } catch (cause) {
      setError(flow.errorMessage(cause, "We could not verify that code. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    setError("");
    setNotice("");
    if (!flow.isLoaded) return setError("We could not resend the code yet. Please try again.");
    setIsResending(true);
    try {
      await flow.resend();
      setNotice(step.kind === "email_link" ? "A fresh sign-in link has been sent." : "A fresh verification code has been sent.");
    } catch (cause) {
      setError(flow.errorMessage(cause, "We could not resend the code."));
    } finally {
      setIsResending(false);
    }
  }

  async function handleCollect(event: React.FormEvent) {
    event.preventDefault();
    if (step.kind !== "collect") return;
    setError("");
    if (missingRequiredFields(capabilities, values, step.fields).length > 0) return setError("Please fill in all required fields.");
    if (step.fields.includes("password")) {
      const problems = passwordPolicyErrors(values.password, capabilities.password);
      if (problems.length > 0) return setError(problems.join(" "));
      if (values.password !== values.confirmPassword) return setError("Passwords don't match.");
    }
    if ((step.consent || capabilities.signUp.legalConsentEnabled) && !legalAccepted) {
      return setError("You must accept the Terms of Service and Privacy Policy.");
    }
    setIsSubmitting(true);
    try {
      const payload: Parameters<typeof flow.update>[0] = {};
      for (const field of step.fields) payload[field] = values[field];
      if (step.consent || capabilities.signUp.legalConsentEnabled) payload.legalAccepted = legalAccepted;
      await applyNext(await flow.update(payload));
    } catch (cause) {
      setError(flow.errorMessage(cause, "We could not finish your sign-up. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authLoaded && isSignedIn) return null;

  if (step.kind === "collect") {
    return (
      <AuthPageLayout title="Finish your account" description="A few more details are needed.">
        <form onSubmit={handleCollect} noValidate className="flex flex-col gap-4">
          {error ? <AuthError message={error} /> : null}
          {step.fields.length > 0 && (
            <SignUpFields capabilities={capabilities} values={values} onChange={setValues} only={step.fields} idPrefix="verify-continue" />
          )}
          {(step.consent || capabilities.signUp.legalConsentEnabled) && (
            <LegalConsent capabilities={capabilities} checked={legalAccepted} onChange={setLegalAccepted} id="verify-legal-consent" />
          )}
          {capabilities.signUp.captchaEnabled && <div id="clerk-captcha" />}
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !flow.isLoaded}>
            {isSubmitting ? "Finishing..." : "Finish sign-up"}
          </Button>
        </form>
      </AuthPageLayout>
    );
  }

  const isPhone = step.kind === "phone_code";
  const isLink = step.kind === "email_link";

  return (
    <AuthPageLayout
      title={isPhone ? "Verify Your Phone" : "Verify Your Email"}
      description={isLink ? "Open the link we emailed you to continue." : "Enter the code we sent you to continue."}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex size-10 items-center justify-center rounded-none bg-primary/10">
            <MailCheck className="size-4 text-primary" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {isPhone
                ? "We texted a verification code to your phone."
                : pendingContext?.email
                  ? `We sent ${isLink ? "a sign-in link" : "a verification code"} to ${pendingContext.email}.`
                  : `We sent ${isLink ? "a sign-in link" : "a verification code"} to your email address.`}
            </p>
            <p className="text-xs text-muted-foreground">Verify to {destinationLabel}.</p>
            {isSubscriptionResume && (
              <p className="text-xs text-muted-foreground">
                After verification, we will return you to your plan checkout so you can complete payment while signed in.
              </p>
            )}
          </div>
        </div>

        {isLink ? (
          <div className="flex flex-col gap-3">
            {error ? <AuthError message={error} /> : null}
            {notice ? <div className="border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">{notice}</div> : null}
            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Waiting for you to open the link… this page continues automatically.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmitCode} noValidate className="flex flex-col gap-4">
            {error ? <AuthError message={error} /> : null}
            {notice ? <div className="border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">{notice}</div> : null}
            <CodeInput id="verify-email-code" value={code} onChange={setCode} />
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !flow.isLoaded}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  {isPhone ? "Verify Phone" : "Verify Email"}
                </>
              )}
            </Button>
          </form>
        )}

        <Button type="button" variant="outline" size="sm" className="w-full" onClick={handleResend} disabled={isResending || !flow.isLoaded}>
          {isResending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <RotateCw className="size-4" />
              {isLink ? "Send a new link" : "Send New Code"}
            </>
          )}
        </Button>

        <div className="space-y-1 text-center">
          <p className="text-xs text-muted-foreground">If you refreshed this page and your verification session was lost, start the signup flow again.</p>
          <div className="flex items-center justify-center gap-3 text-xs">
            <AuthLink to="/register">Create account</AuthLink>
            <AuthLink to="/login">Sign in instead</AuthLink>
          </div>
        </div>
      </div>
    </AuthPageLayout>
  );
}
