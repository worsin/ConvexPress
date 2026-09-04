/**
 * Depot · auth.verify — verify email (code or link), verify phone, and the
 * "finish your account" step inside the Depot auth frame. The sign-up flow,
 * polling and all Clerk calls live in the route; the collect-step drafts are
 * local here. Same disabled states and copy as Core.
 */
import { Loader2, MailCheck, RotateCw, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { AuthError } from "@/components/auth/AuthError";
import { AuthLink } from "@/components/auth/AuthLink";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { CodeInput } from "@/components/auth/CodeInput";
import { LegalConsent } from "@/components/auth/LegalConsent";
import { SignUpFields, emptySignUpValues, type SignUpFieldValues } from "@/components/auth/SignUpFields";
import type { AuthVerifyStep, AuthVerifySurfaceData } from "@/templates/packs/core/surfaces/auth.verify";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button } from "../parts";

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="rounded-md border border-primary/30 bg-primary/5 p-3 text-[13px] text-foreground">
      {children}
    </div>
  );
}

export default function DepotAuthVerify({ data }: SurfaceProps<AuthVerifySurfaceData>) {
  const { step, code, onCodeChange, error, notice, isSubmitting, isResending, flowReady, email, isSubscriptionResume, destinationLabel, actions } = data;

  if (step.kind === "collect") {
    return <CollectStep step={step} data={data} />;
  }

  const isPhone = step.kind === "phone_code";
  const isLink = step.kind === "email_link";

  return (
    <AuthPageLayout title={isPhone ? "Verify your phone" : "Verify your email"} description={isLink ? "Open the link we emailed you to continue." : "Enter the code we sent you to continue."}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MailCheck className="size-4" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1 text-[13px] leading-5 text-muted-foreground">
            <p>
              {isPhone
                ? "We texted a verification code to your phone."
                : email
                  ? `We sent ${isLink ? "a sign-in link" : "a verification code"} to ${email}.`
                  : `We sent ${isLink ? "a sign-in link" : "a verification code"} to your email address.`}
            </p>
            <p>Verify to {destinationLabel}.</p>
            {isSubscriptionResume && <p>After verification, we will return you to your plan checkout so you can complete payment while signed in.</p>}
          </div>
        </div>

        {isLink ? (
          <div className="flex flex-col gap-3">
            {error ? <AuthError message={error} className="rounded-md" /> : null}
            {notice ? <Notice>{notice}</Notice> : null}
            <p className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Waiting for you to open the link… this page continues automatically.
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
            {error ? <AuthError message={error} className="rounded-md" /> : null}
            {notice ? <Notice>{notice}</Notice> : null}
            <CodeInput id="verify-email-code" value={code} onChange={onCodeChange} />
            <Button type="submit" className="w-full" disabled={isSubmitting || !flowReady}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Verifying...
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  {isPhone ? "Verify phone" : "Verify email"}
                </>
              )}
            </Button>
          </form>
        )}

        <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => void actions.resend()} disabled={isResending || !flowReady}>
          {isResending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Sending...
            </>
          ) : (
            <>
              <RotateCw className="size-4" aria-hidden="true" />
              {isLink ? "Send a new link" : "Send new code"}
            </>
          )}
        </Button>

        <div className="flex flex-col gap-1 text-center">
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

function CollectStep({ step, data }: { step: Extract<AuthVerifyStep, { kind: "collect" }>; data: AuthVerifySurfaceData }) {
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
        {error ? <AuthError message={error} className="rounded-md" /> : null}
        {step.fields.length > 0 && <SignUpFields capabilities={capabilities} values={values} onChange={setValues} only={step.fields} idPrefix="verify-continue" />}
        {consentShown && <LegalConsent capabilities={capabilities} checked={legalAccepted} onChange={setLegalAccepted} id="verify-legal-consent" />}
        {capabilities.signUp.captchaEnabled && <div id="clerk-captcha" />}
        <Button type="submit" className="w-full" disabled={isSubmitting || !flowReady}>
          {isSubmitting ? "Finishing..." : "Finish sign-up"}
        </Button>
      </form>
    </AuthPageLayout>
  );
}
