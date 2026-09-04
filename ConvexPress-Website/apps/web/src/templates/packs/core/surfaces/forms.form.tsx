/** Core · forms.form — public form page: the wizard, or the post-payment return states. */
import { AuthError } from "@/components/auth/AuthError";
import { SubmittedConfirmation, type PublicForm } from "@/components/forms/FormRenderer";
import { FormWizard } from "@/extensions/forms/FormWizard";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface FormSurfaceData {
  form: PublicForm;
  slug: string;
  /** Allowlisted prefill resolved from the URL (fieldKey → value). */
  initialValues: Record<string, string>;
  /** Order-form mode widens the page. */
  orderFormEnabled: boolean;
  /**
   * Set when the visitor returns from Stripe (`?payment=complete`);
   * `status` is Stripe's `redirect_status` (succeeded / processing / …).
   */
  paymentReturn: { status?: string } | null;
}

export default function CoreForm({ data }: SurfaceProps<FormSurfaceData>) {
  const { form, slug, initialValues, orderFormEnabled, paymentReturn } = data;

  if (paymentReturn) {
    if (paymentReturn.status === "succeeded") {
      return (
        <div className="mx-auto w-full max-w-2xl py-10">
          <SubmittedConfirmation formTitle={form.title} renderedMessage="" />
        </div>
      );
    }
    return (
      <div className="mx-auto w-full max-w-2xl py-10">
        <PaymentReturnNotice
          formTitle={form.title}
          slug={slug}
          status={paymentReturn.status}
        />
      </div>
    );
  }

  return (
    <div
      className={
        orderFormEnabled
          ? "mx-auto w-full max-w-6xl py-10"
          : "mx-auto w-full max-w-2xl py-10"
      }
    >
      <FormWizard form={form} initialValues={initialValues} />
    </div>
  );
}

function PaymentReturnNotice({
  formTitle,
  slug,
  status,
}: {
  formTitle: string;
  slug: string;
  status?: string;
}) {
  const normalized = status ?? "unknown";
  const isProcessing = normalized === "processing";
  return (
    <section className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6">
      <div className="flex flex-col gap-1.5 border-b border-border pb-4">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          {formTitle}
        </p>
        <h1 className="text-xl font-semibold text-foreground">
          {isProcessing ? "Payment processing" : "Payment not completed"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isProcessing
            ? "Stripe is still processing this payment. You can refresh this page in a moment."
            : "Stripe did not confirm a successful payment for this order."}
        </p>
      </div>
      {!isProcessing ? (
        <AuthError message="Payment was not completed. Please try the form again or contact support if you were charged." />
      ) : null}
      <a
        href={`/forms/${slug}`}
        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Return to form
      </a>
    </section>
  );
}
