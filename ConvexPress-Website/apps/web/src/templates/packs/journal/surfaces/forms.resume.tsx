/**
 * Journal · forms.resume — rehydrate a saved draft into the shared FormWizard
 * in the reading measure, or show the shared expired-draft notice.
 */
import { DraftExpiredNotice } from "@/extensions/forms/DraftExpiredNotice";
import { FormWizard } from "@/extensions/forms/FormWizard";
import type { FormResumeSurfaceData } from "@/templates/packs/core/surfaces/forms.resume";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, SectionHeading } from "../parts";

export default function JournalFormResume({ data }: SurfaceProps<FormResumeSurfaceData>) {
  const { form, slug, token, draft } = data;

  if (draft.status === "expired") {
    return (
      <Container data-slot="form-resume" className="py-6 md:py-10">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
          <SectionHeading level={1} eyebrow="Saved form" title={form.title} />
          <DraftExpiredNotice slug={slug} />
        </div>
      </Container>
    );
  }

  return (
    <Container data-slot="form-resume" className="py-6 md:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <FormWizard form={form} resumeToken={token} initialValues={draft.values} initialStep={draft.currentStep} onSubmittingChange={data.onSubmittingChange} onSubmitted={data.onSubmitted} />
      </div>
    </Container>
  );
}
