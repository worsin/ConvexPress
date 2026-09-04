/**
 * Depot · forms.form — the public form page: `FormWizard` in the Depot frame
 * (reading measure, or the full container for order forms), plus the
 * post-payment return states as cards. Same gates as Core.
 */
import { AuthError } from "@/components/auth/AuthError";
import { SubmittedConfirmation } from "@/components/forms/FormRenderer";
import { FormWizard } from "@/extensions/forms/FormWizard";
import { cn } from "@/lib/utils";
import type { FormSurfaceData } from "@/templates/packs/core/surfaces/forms.form";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Card, Container, Label, Prose, buttonClasses } from "../parts";
import { frameReset } from "../parts/extra-plugins";

export default function DepotForm({ data }: SurfaceProps<FormSurfaceData>) {
  const { form, slug, initialValues, orderFormEnabled, paymentReturn } = data;

  if (paymentReturn) {
    return (
      <Prose data-slot="form-page" data-pack="depot" className={cn("py-6 md:py-8", frameReset)}>
        {paymentReturn.status === "succeeded" ? <SubmittedConfirmation formTitle={form.title} renderedMessage="" /> : <PaymentReturnNotice formTitle={form.title} slug={slug} status={paymentReturn.status} />}
      </Prose>
    );
  }

  const Frame = orderFormEnabled ? Container : Prose;
  return (
    <Frame {...(orderFormEnabled ? { padded: false } : {})} data-slot="form-page" data-pack="depot" className={cn("py-6 md:py-8", frameReset)}>
      <FormWizard form={form} initialValues={initialValues} />
    </Frame>
  );
}

function PaymentReturnNotice({ formTitle, slug, status }: { formTitle: string; slug: string; status?: string }) {
  const normalized = status ?? "unknown";
  const isProcessing = normalized === "processing";
  return (
    <Card as="section" className="flex flex-col gap-4 p-4 sm:p-5" role="status">
      <div className="flex flex-col gap-1 border-b border-border pb-3">
        <Label>{formTitle}</Label>
        <h1 className="text-lg font-semibold text-foreground">{isProcessing ? "Payment processing" : "Payment not completed"}</h1>
        <p className="text-[13px] leading-5 text-muted-foreground">{isProcessing ? "Stripe is still processing this payment. You can refresh this page in a moment." : "Stripe did not confirm a successful payment for this order."}</p>
      </div>
      {!isProcessing ? <AuthError message="Payment was not completed. Please try the form again or contact support if you were charged." className="rounded-md" /> : null}
      <a href={`/forms/${slug}`} className={buttonClasses("primary", "md", "self-start")}>
        Return to form
      </a>
    </Card>
  );
}
