/**
 * Depot · forms.resume — rehydrate a saved draft into `FormWizard` in the
 * Depot frame, or show the expired notice. Same token / step handling as Core.
 */
import { DraftExpiredNotice } from "@/extensions/forms/DraftExpiredNotice";
import { FormWizard } from "@/extensions/forms/FormWizard";
import { cn } from "@/lib/utils";
import type { FormResumeSurfaceData } from "@/templates/packs/core/surfaces/forms.resume";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Prose } from "../parts";
import { frameReset } from "../parts/extra-plugins";

export default function DepotFormResume({ data }: SurfaceProps<FormResumeSurfaceData>) {
  const { form, slug, token, draft } = data;

  if (draft.status === "expired") {
    return (
      <Prose data-slot="form-resume" data-pack="depot" className={cn("py-6 md:py-8 [&_a.rounded-full]:rounded-md", frameReset)}>
        <DraftExpiredNotice slug={slug} />
      </Prose>
    );
  }

  return (
    <Prose data-slot="form-resume" data-pack="depot" className={cn("py-6 md:py-8", frameReset)}>
      <FormWizard form={form} resumeToken={token} initialValues={draft.values} initialStep={draft.currentStep} />
    </Prose>
  );
}
