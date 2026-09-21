/**
 * Aster · forms.form — the public form page in the reading measure (wider
 * when order-form mode is on), composing the shared FormWizard. The
 * post-payment return states mirror Core: the confirmation on success, and a
 * rule-separated notice with the same messages otherwise.
 */
import { AuthError } from "@/components/auth/AuthError";
import { SubmittedConfirmation } from "@/components/forms/FormRenderer";
import { FormWizard } from "@/extensions/forms/FormWizard";
import type { FormSurfaceData } from "@/templates/packs/core/surfaces/forms.form";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, Eyebrow, LinkButton } from "../parts";

export default function AsterForm({ data }: SurfaceProps<FormSurfaceData>) {
  const { form, slug, initialValues, orderFormEnabled, paymentReturn } = data;

  if (paymentReturn) {
    return (
      <Container data-slot="form-page" className="py-6 md:py-10">
        <div className="mx-auto w-full max-w-2xl">
          {paymentReturn.status === "succeeded" ? <SubmittedConfirmation formTitle={form.title} renderedMessage="" /> : <PaymentReturnNotice formTitle={form.title} slug={slug} status={paymentReturn.status} />}
        </div>
      </Container>
    );
  }

  return (
    <Container data-slot="form-page" className="py-6 md:py-10">
      <div className={orderFormEnabled ? "mx-auto w-full max-w-6xl" : "mx-auto w-full max-w-2xl"}>
        <FormWizard form={form} initialValues={initialValues} />
      </div>
    </Container>
  );
}

function PaymentReturnNotice({ formTitle, slug, status }: { formTitle: string; slug: string; status?: string }) {
  const normalized = status ?? "unknown";
  const isProcessing = normalized === "processing";
  return (
    <section className="flex flex-col gap-6 border-y border-border py-10" role="status" aria-live="polite">
      <div className="flex flex-col gap-3">
        <Eyebrow>{formTitle}</Eyebrow>
        <h1 className="font-display text-3xl leading-[1.08] tracking-tight text-foreground md:text-4xl">{isProcessing ? "Payment processing" : "Payment not completed"}</h1>
        <p className="text-base leading-8 text-muted-foreground md:text-[17px]">
          {isProcessing ? "Stripe is still processing this payment. You can refresh this page in a moment." : "Stripe did not confirm a successful payment for this order."}
        </p>
      </div>
      {!isProcessing ? <AuthError message="Payment was not completed. Please try the form again or contact support if you were charged." /> : null}
      <div>
        <LinkButton to="/forms/$slug" params={{ slug }} variant="primary">
          Return to form
        </LinkButton>
      </div>
    </section>
  );
}
