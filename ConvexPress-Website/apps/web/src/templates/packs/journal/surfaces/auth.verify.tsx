/**
 * Journal · auth.verify — verify email (code or link), verify phone, and the
 * "finish your account" step, inside the Journal auth frame. The sign-up
 * flow, polling and all Clerk calls live in the route; the collect-step
 * field drafts are local here. Same copy, gates and disabled states as Core.
 */
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { AuthError } from "@/components/auth/AuthError";
import { AuthLink } from "@/components/auth/AuthLink";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { CodeInput } from "@/components/auth/CodeInput";
import { LegalConsent } from "@/components/auth/LegalConsent";
import { SignUpFields, emptySignUpValues, type SignUpFieldValues } from "@/components/auth/SignUpFields";
import type { AuthVerifyStep, AuthVerifySurfaceData } from "@/templates/packs/core/surfaces/auth.verify";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, SmallCaps } from "../parts";

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-l-2 border-primary pl-4 text-sm leading-6 text-foreground" role="status">
      {children}
    </p>
  );
}

export default function JournalAuthVerify({ data }: SurfaceProps<AuthVerifySurfaceData>) {
  const { step, code, onCodeChange, error, notice, isSubmitting, isResending, flowReady, email, isSubscriptionResume, destinationLabel, actions } = data;

  if (step.kind === "collect") {
    return <CollectStep step={step} data={data} />;
  }

  const isPhone = step.kind === "phone_code";
  const isLink = step.kind === "email_link";

  return (
    <AuthPageLayout title={isPhone ? "Verify your phone" : "Verify your email"} description={isLink ? "Open the link we emailed you to continue." : "Enter the code we sent you to continue."}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5 text-center">
          <p className="text-sm leading-6 text-muted-foreground">
            {isPhone
              ? "We texted a verification code to your phone."
              : email
                ? `We sent ${isLink ? "a sign-in link" : "a verification code"} to ${email}.`
                : `We sent ${isLink ? "a sign-in link" : "a verification code"} to your email address.`}
          </p>
          <p className="text-sm leading-6 text-muted-foreground">Verify to {destinationLabel}.</p>
          {isSubscriptionResume ? <p className="text-xs leading-6 text-muted-foreground">After verification, we will return you to your plan checkout so you can complete payment while signed in.</p> : null}
        </div>

        {isLink ? (
          <div className="flex flex-col gap-3">
            {error ? <AuthError message={error} /> : null}
            {notice ? <Notice>{notice}</Notice> : null}
            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
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
            className="flex flex-col gap-5"
          >
            {error ? <AuthError message={error} /> : null}
            {notice ? <Notice>{notice}</Notice> : null}
            <CodeInput id="verify-email-code" value={code} onChange={onCodeChange} />
            <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting || !flowReady}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Verifying...
                </>
              ) : isPhone ? (
                "Verify phone"
              ) : (
                "Verify email"
              )}
            </Button>
          </form>
        )}

        <Button type="button" variant="ghost" className="w-full" onClick={() => void actions.resend()} disabled={isResending || !flowReady}>
          {isResending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Sending...
            </>
          ) : isLink ? (
            "Send a new link"
          ) : (
            "Send a new code"
          )}
        </Button>

        <div className="flex flex-col items-center gap-2 border-t border-border pt-5 text-center">
          <p className="text-xs leading-6 text-muted-foreground">If you refreshed this page and your verification session was lost, start the signup flow again.</p>
          <div className="flex items-center justify-center gap-4 text-xs">
            <AuthLink to="/register">Create account</AuthLink>
            <SmallCaps aria-hidden="true">/</SmallCaps>
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
        className="flex flex-col gap-5"
      >
        {error ? <AuthError message={error} /> : null}
        {step.fields.length > 0 ? <SignUpFields capabilities={capabilities} values={values} onChange={setValues} only={step.fields} idPrefix="verify-continue" /> : null}
        {consentShown ? <LegalConsent capabilities={capabilities} checked={legalAccepted} onChange={setLegalAccepted} id="verify-legal-consent" /> : null}
        {capabilities.signUp.captchaEnabled ? <div id="clerk-captcha" /> : null}
        <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting || !flowReady}>
          {isSubmitting ? "Finishing..." : "Finish sign-up"}
        </Button>
      </form>
    </AuthPageLayout>
  );
}
