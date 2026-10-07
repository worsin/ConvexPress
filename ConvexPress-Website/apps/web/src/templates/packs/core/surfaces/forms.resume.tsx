/** Core · forms.resume — rehydrate a saved draft into the wizard, or show the expired notice. */
import type { PublicForm } from "@/components/forms/FormRenderer";
import { DraftExpiredNotice } from "@/extensions/forms/DraftExpiredNotice";
import { FormWizard } from "@/extensions/forms/FormWizard";
import type { SurfaceProps } from "@/templates/sdk/types";

/** A resumable (partial) draft, keyed by fieldKey. */
export type ResumeDraftPartial = {
  submissionId: string;
  formSlug: string;
  status: "partial";
  currentStep: number;
  expiresAt: number;
  values: Record<string, string>;
};

export type ResumeDraftState = { status: "expired" } | ResumeDraftPartial;

export interface FormResumeSurfaceData {
  form: PublicForm;
  slug: string;
  /** Opaque resume token — the credential for an anonymous draft. */
  token: string;
  /** The draft to rehydrate, or the TTL marker. */
  draft: ResumeDraftState;
  onSubmittingChange?: (submitting: boolean) => void;
  onSubmitted?: () => void;
}

export default function CoreFormResume({ data }: SurfaceProps<FormResumeSurfaceData>) {
  const { form, slug, token, draft } = data;

  // Expired / non-resumable → start-fresh notice.
  if (draft.status === "expired") {
    return (
      <div className="mx-auto w-full max-w-2xl py-10">
        <DraftExpiredNotice slug={slug} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <FormWizard
        form={form}
        resumeToken={token}
        initialValues={draft.values}
        initialStep={draft.currentStep}
        onSubmittingChange={data.onSubmittingChange}
        onSubmitted={data.onSubmitted}
      />
    </div>
  );
}
