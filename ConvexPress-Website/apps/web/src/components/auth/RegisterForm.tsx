/**
 * RegisterForm — sign-up that follows the site's Clerk configuration.
 *
 * Fields, required flags, verification strategy, legal consent and bot
 * protection all come from `useAuthCapabilities()`. After `signUp.create`,
 * `useSignUpFlow` tells us the next step: complete, verify email (code or
 * link), verify phone, collect missing fields (also how an OAuth transfer
 * lands here), consent, or a restricted sign-up mode.
 */

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuthCapabilities } from "@/contexts/AuthConfigContext";
import { useSignUpFlow } from "@/hooks/useSignUpFlow";
import { passwordPolicyErrors, type SignUpFieldName } from "@/lib/auth/capabilities";
import type { SignUpNext } from "@/lib/auth/clerk-flow";
import type { InvitationData } from "@/lib/auth/types";
import { clearPendingVerificationContext, writePendingVerificationContext } from "@/lib/auth/verification";
import { cn } from "@/lib/utils";

import { AuthError } from "./AuthError";
import { AuthLink } from "./AuthLink";
import { CodeInput } from "./CodeInput";
import { LegalConsent } from "./LegalConsent";
import { SignUpFields, emptySignUpValues, missingRequiredFields, type SignUpFieldValues } from "./SignUpFields";

interface RegisterFormProps {
  invitation?: InvitationData;
  returnTo?: string;
  className?: string;
}

type Step =
  | { kind: "form" }
  | { kind: "collect"; fields: SignUpFieldName[]; consent: boolean }
  | { kind: "verify_phone" }
  | { kind: "restricted" };

export function RegisterForm({ invitation, returnTo = "/dashboard", className }: RegisterFormProps) {
  const capabilities = useAuthCapabilities();
  const flow = useSignUpFlow();
  const [values, setValues] = useState<SignUpFieldValues>(() => ({
    ...emptySignUpValues(),
    emailAddress: invitation?.email ?? "",
  }));
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [phoneCode, setPhoneCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "form" });

  const passwordEnabled = capabilities.attributes.password.enabled;
  const consentRequired = capabilities.signUp.legalConsentEnabled;

  // Resume a sign-up that Clerk already started (OAuth transfer, refreshed page).
  useEffect(() => {
    if (!flow.isLoaded) return;
    const current = flow.current();
    if (!current) return;
    if (current.kind === "collect") setStep({ kind: "collect", fields: current.fields, consent: false });
    else if (current.kind === "legal_consent") setStep({ kind: "collect", fields: [], consent: true });
    else if (current.kind === "verify_phone") setStep({ kind: "verify_phone" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.isLoaded]);

  const lockedFields = useMemo(
    () => (invitation?.email ? { emailAddress: invitation.email } : undefined),
    [invitation?.email],
  );

  const go = (url: string) => {
    if (typeof window !== "undefined") window.location.assign(url);
  };

  const handleNext = async (next: SignUpNext) => {
    switch (next.kind) {
      case "complete":
        clearPendingVerificationContext();
        await flow.complete(next.sessionId);
        go(returnTo);
        return;
      case "verify_email": {
        writePendingVerificationContext({
          email: values.emailAddress.trim() || invitation?.email,
          returnTo,
          source: "register",
          strategy: next.strategy,
        });
        const url = new URL("/verify-email", window.location.origin);
        url.searchParams.set("returnTo", returnTo);
        go(url.toString());
        return;
      }
      case "verify_phone":
        setStep({ kind: "verify_phone" });
        return;
      case "collect":
        setStep({ kind: "collect", fields: next.fields, consent: false });
        if (next.unknown.length > 0) {
          setError(`Clerk also requires: ${next.unknown.join(", ")}. Finish sign-up in your account portal or contact support.`);
        }
        return;
      case "legal_consent":
        setStep({ kind: "collect", fields: [], consent: true });
        return;
      case "captcha":
        setError("Please complete the security check and try again.");
        return;
      case "restricted":
        setStep({ kind: "restricted" });
        return;
      case "abandoned":
        setError("This sign-up expired. Please start again.");
        setStep({ kind: "form" });
        return;
      default:
        setError("Registration requires an additional step we could not determine. Please try again.");
    }
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!flow.isLoaded) return;

    const missing = missingRequiredFields(capabilities, values);
    if (missing.length > 0) {
      setError("Please fill in all required fields.");
      return;
    }
    if (passwordEnabled && (values.password || capabilities.attributes.password.required)) {
      const problems = passwordPolicyErrors(values.password, capabilities.password);
      if (problems.length > 0) {
        setError(problems.join(" "));
        return;
      }
      if (values.password !== values.confirmPassword) {
        setError("Passwords don't match.");
        return;
      }
    }
    if (consentRequired && !legalAccepted) {
      setError("You must accept the Terms of Service and Privacy Policy.");
      return;
    }

    setIsSubmitting(true);
    try {
      const next = await flow.create({
        emailAddress: lockedFields?.emailAddress ?? values.emailAddress,
        phoneNumber: values.phoneNumber,
        username: values.username,
        firstName: values.firstName,
        lastName: values.lastName,
        password: passwordEnabled ? values.password : undefined,
        legalAccepted: consentRequired ? legalAccepted : undefined,
      });
      await handleNext(next);
    } catch (cause) {
      setError(flow.errorMessage(cause, "Registration failed. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitCollect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step.kind !== "collect") return;
    setError("");
    const missing = missingRequiredFields(capabilities, values, step.fields);
    if (missing.length > 0) {
      setError("Please fill in all required fields.");
      return;
    }
    if (step.fields.includes("password")) {
      const problems = passwordPolicyErrors(values.password, capabilities.password);
      if (problems.length > 0) return setError(problems.join(" "));
      if (values.password !== values.confirmPassword) return setError("Passwords don't match.");
    }
    if ((step.consent || consentRequired) && !legalAccepted) {
      setError("You must accept the Terms of Service and Privacy Policy.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: Parameters<typeof flow.update>[0] = {};
      for (const field of step.fields) payload[field] = values[field];
      if (step.consent || consentRequired) payload.legalAccepted = legalAccepted;
      await handleNext(await flow.update(payload));
    } catch (cause) {
      setError(flow.errorMessage(cause, "We could not finish your sign-up. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitPhoneCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!phoneCode.trim()) return setError("Enter the code we texted you.");
    setIsSubmitting(true);
    try {
      await handleNext(await flow.attemptPhoneCode(phoneCode));
    } catch (cause) {
      setError(flow.errorMessage(cause, "That code did not work. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step.kind === "restricted") {
    return (
      <div data-slot="register-restricted" className={cn("flex flex-col gap-3 text-center", className)}>
        <p className="text-sm text-foreground">Sign-ups are currently limited on this site.</p>
        <p className="text-xs text-muted-foreground">
          {capabilities.signUp.mode === "waitlist"
            ? "Join the waitlist from the sign-in provider, or contact us for access."
            : "Ask the site owner for an invitation, or sign in if you already have an account."}
        </p>
        <AuthLink to="/login">Sign in instead</AuthLink>
      </div>
    );
  }

  if (step.kind === "verify_phone") {
    return (
      <form data-slot="register-verify-phone" className={cn("flex flex-col gap-4", className)} onSubmit={submitPhoneCode} noValidate>
        {error && <AuthError message={error} />}
        <p className="text-xs text-muted-foreground">We texted a code to your phone. Enter it to continue.</p>
        <CodeInput id="register-phone-code" value={phoneCode} onChange={setPhoneCode} />
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Verifying..." : "Verify phone"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={isSubmitting}
          onClick={async () => {
            setError("");
            try {
              await flow.resend();
            } catch (cause) {
              setError(flow.errorMessage(cause, "We could not resend the code."));
            }
          }}
        >
          Send a new code
        </Button>
      </form>
    );
  }

  if (step.kind === "collect") {
    return (
      <form data-slot="register-continue" className={cn("flex flex-col gap-4", className)} onSubmit={submitCollect} noValidate>
        <p className="text-xs text-muted-foreground">Almost there. A few more details are needed to finish your account.</p>
        {error && <AuthError message={error} />}
        {step.fields.length > 0 && (
          <SignUpFields capabilities={capabilities} values={values} onChange={setValues} only={step.fields} idPrefix="register-continue" />
        )}
        {(step.consent || consentRequired) && (
          <LegalConsent capabilities={capabilities} checked={legalAccepted} onChange={setLegalAccepted} />
        )}
        {capabilities.signUp.captchaEnabled && <div id="clerk-captcha" />}
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !flow.isLoaded}>
          {isSubmitting ? "Finishing..." : "Finish sign-up"}
        </Button>
      </form>
    );
  }

  return (
    <form data-slot="register-form" className={cn("flex flex-col gap-4", className)} onSubmit={submitForm} noValidate>
      {invitation?.message && (
        <div data-slot="invitation-banner" className="rounded-none border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
          {invitation.inviterName && <p className="mb-1 font-medium">Invited by {invitation.inviterName}</p>}
          <p className="text-muted-foreground">{invitation.message}</p>
        </div>
      )}

      {error && <AuthError message={error} />}

      <SignUpFields capabilities={capabilities} values={values} onChange={setValues} locked={lockedFields} />

      {consentRequired && <LegalConsent capabilities={capabilities} checked={legalAccepted} onChange={setLegalAccepted} />}

      {/* Clerk mounts its bot-protection widget here when it is enabled. */}
      {capabilities.signUp.captchaEnabled && <div id="clerk-captcha" />}

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !flow.isLoaded}>
        {isSubmitting ? "Creating account..." : "Create Account"}
      </Button>

      <div className="text-center">
        <span className="text-xs text-muted-foreground">Already have an account? </span>
        <AuthLink to="/login">Sign in</AuthLink>
      </div>
    </form>
  );
}
