/**
 * Core · auth.verify — verify email (code or link), verify phone, and the
 * "finish your account" step for any fields Clerk still needs. The sign-up
 * flow, polling and all Clerk calls live in the route; the field drafts for
 * the collect step are local here.
 */
import { useState } from "react";
import { Loader2, MailCheck, RotateCw, ShieldCheck } from "lucide-react";

import { AuthError } from "@/components/auth/AuthError";
import { AuthLink } from "@/components/auth/AuthLink";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { CodeInput } from "@/components/auth/CodeInput";
import { LegalConsent } from "@/components/auth/LegalConsent";
import { SignUpFields, emptySignUpValues, type SignUpFieldValues } from "@/components/auth/SignUpFields";
import { Button } from "@/components/ui/button";
import type { AuthCapabilities, SignUpFieldName } from "@/lib/auth/capabilities";
import type { SurfaceProps } from "@/templates/sdk/types";

export type AuthVerifyStep =
  | { kind: "email_code" }
  | { kind: "email_link" }
  | { kind: "phone_code" }
  | { kind: "collect"; fields: SignUpFieldName[]; consent: boolean }
  | { kind: "done" };

export interface AuthVerifySurfaceData {
  step: AuthVerifyStep;
  /** Site auth configuration (which fields exist, consent, captcha). */
  capabilities: AuthCapabilities;
  /** The verification code draft (owned by the route so Clerk steps can reset it). */
  code: string;
  onCodeChange: (code: string) => void;
  error: string;
  notice: string;
  isSubmitting: boolean;
  isResending: boolean;
  /** False until the Clerk sign-up flow is ready; controls disabled states. */
  flowReady: boolean;
  /** The address the code / link was sent to, when known. */
  email?: string;
  /** True when verification resumes a subscription signup. */
  isSubscriptionResume: boolean;
  /** "continue your subscription signup" or "finish signing in". */
  destinationLabel: string;
  actions: {
    submitCode: () => Promise<void>;
    resend: () => Promise<void>;
    /** Finish sign-up with the collected fields and consent. */
    collect: (values: SignUpFieldValues, legalAccepted: boolean) => Promise<void>;
  };
}

export default function CoreAuthVerify({ data }: SurfaceProps<AuthVerifySurfaceData>) {
  const { step, code, onCodeChange, error, notice, isSubmitting, isResending, flowReady, email, isSubscriptionResume, destinationLabel, actions } = data;

  if (step.kind === "collect") {
    return <CollectStep step={step} data={data} />;
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
                : email
                  ? `We sent ${isLink ? "a sign-in link" : "a verification code"} to ${email}.`
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
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void actions.submitCode();
            }}
            noValidate
            className="flex flex-col gap-4"
          >
            {error ? <AuthError message={error} /> : null}
            {notice ? <div className="border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">{notice}</div> : null}
            <CodeInput id="verify-email-code" value={code} onChange={onCodeChange} />
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !flowReady}>
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

        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => void actions.resend()} disabled={isResending || !flowReady}>
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

function CollectStep({
  step,
  data,
}: {
  step: Extract<AuthVerifyStep, { kind: "collect" }>;
  data: AuthVerifySurfaceData;
}) {
  const { capabilities, error, isSubmitting, flowReady, actions } = data;
  const [values, setValues] = useState<SignUpFieldValues>(emptySignUpValues);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const consentShown = step.consent || capabilities.signUp.legalConsentEnabled;

  return (
    <AuthPageLayout title="Finish your account" description="A few more details are needed.">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void actions.collect(values, legalAccepted);
        }}
        noValidate
        className="flex flex-col gap-4"
      >
        {error ? <AuthError message={error} /> : null}
        {step.fields.length > 0 && (
          <SignUpFields capabilities={capabilities} values={values} onChange={setValues} only={step.fields} idPrefix="verify-continue" />
        )}
        {consentShown && (
          <LegalConsent capabilities={capabilities} checked={legalAccepted} onChange={setLegalAccepted} id="verify-legal-consent" />
        )}
        {capabilities.signUp.captchaEnabled && <div id="clerk-captcha" />}
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !flowReady}>
          {isSubmitting ? "Finishing..." : "Finish sign-up"}
        </Button>
      </form>
    </AuthPageLayout>
  );
}
