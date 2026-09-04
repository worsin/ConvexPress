import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { missingRequiredFields, type SignUpFieldValues } from "@/components/auth/SignUpFields";
import { useAuthCapabilities } from "@/contexts/AuthConfigContext";
import { useSignUpFlow } from "@/hooks/useSignUpFlow";
import { useAuth } from "@/lib/auth/clerk";
import { passwordPolicyErrors } from "@/lib/auth/capabilities";
import type { SignUpNext } from "@/lib/auth/clerk-flow";
import {
  clearPendingSubscriptionIntent,
  clearPendingVerificationContext,
  readPendingVerificationContext,
  writePendingVerificationContext,
} from "@/lib/auth/verification";
import { sanitizeRedirectUrl } from "@/lib/security/redirect";
import { buildRestrictedPageHead, siteTitled } from "@/lib/seo/head";
import CoreAuthVerify, { type AuthVerifyStep, type AuthVerifySurfaceData } from "@/templates/packs/core/surfaces/auth.verify";
import { Surface } from "@/templates/sdk/Surface";

const verifyEmailSearchSchema = z.object({
  returnTo: z.string().optional(),
});

export const Route = createFileRoute("/verify-email")({
  validateSearch: verifyEmailSearchSchema,
  head: () => buildRestrictedPageHead({ title: siteTitled("Verify Email"), path: "/verify-email" }),
  component: VerifyEmailComponent,
});

/**
 * Verify email — and whatever Clerk asks for after it.
 *
 * Handles the emailed code, the emailed link (this page polls until the link
 * is opened), a phone code, and any fields Clerk still needs once the email is
 * verified (username, names, consent), so no configuration dead-ends here.
 * Rendering belongs to the `auth.verify` surface.
 */
function VerifyEmailComponent() {
  const capabilities = useAuthCapabilities();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const flow = useSignUpFlow();
  const { returnTo } = Route.useSearch();

  const [pendingContext] = useState(() => readPendingVerificationContext());
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [step, setStep] = useState<AuthVerifyStep>(() =>
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

  async function handleSubmitCode() {
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

  async function handleCollect(values: SignUpFieldValues, legalAccepted: boolean) {
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

  const data: AuthVerifySurfaceData = {
    step,
    capabilities,
    code,
    onCodeChange: setCode,
    error,
    notice,
    isSubmitting,
    isResending,
    flowReady: flow.isLoaded,
    email: pendingContext?.email,
    isSubscriptionResume,
    destinationLabel,
    actions: {
      submitCode: handleSubmitCode,
      resend: handleResend,
      collect: handleCollect,
    },
  };

  return <Surface name="auth.verify" data={data} fallback={CoreAuthVerify} />;
}
