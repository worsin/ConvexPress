/**
 * Form account step — the account step a form shows after its last page when
 * its settings ask for an account at the end (`requireAccountToSubmit`) and
 * the visitor is signed out. The answers are already saved as a draft; the new
 * account claims that draft when the form is submitted (the server attaches a
 * signed-out draft to the account that completes it). See `AccountStep`.
 */
import { AccountStep, type AccountPrefill } from "@/components/auth/AccountStep";

export type { AccountPrefill };

interface FormAccountStepProps {
  prefill: AccountPrefill;
  /** Where a redirect-based step (social sign-in, some links) returns to. */
  returnTo: string;
  onReady: () => void;
  onBack?: () => void;
}

export function FormAccountStep(props: FormAccountStepProps) {
  return (
    <AccountStep
      {...props}
      intro="Create the account you'll use to sign in and manage your subscription. Your answers stay with it."
      signedInIntro="You're signed in. Your answers stay with this account."
      backLabel="Back to the form"
    />
  );
}
