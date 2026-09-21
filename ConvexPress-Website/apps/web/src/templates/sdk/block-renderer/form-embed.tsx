import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { FormFieldRenderer } from "../../../components/forms/FormFieldRenderer";
import { deriveSteps } from "../../../extensions/forms/wizardSteps";
import { deriveInitialValues, selectVisibleFields } from "../../../lib/forms/render/fieldRender";
import type { EmbeddedForm } from "../block-data/portable/formContracts";
import * as P from "../primitives";
import "./form-embed.css";

export type FormPresentation = { submitLabel?: string; autosave?: boolean };
type Host = { render: ((form: EmbeddedForm, presentation?: FormPresentation) => ReactNode) | null; preparing: boolean };
const FormHostContext = createContext<Host>({ render: null, preparing: false });
/** Only the Website host can install interactions. Block attributes and saved
 * preview messages cannot supply callbacks or a different backend client. */
export function FormEmbedProvider({ value, children }: { value: Host; children: ReactNode }) {
  return <FormHostContext value={value}>{children}</FormHostContext>;
}
export const useFormEmbedHost = () => useContext(FormHostContext);
export function EmbeddedFormBody({ form, presentation }: { form: EmbeddedForm; presentation?: FormPresentation }) {
  const host = useContext(FormHostContext);
  if (!deriveSteps(form.fields).some(step => step.fieldKeys.length > 0)) return <P.Text>This form has no fields yet.</P.Text>;
  return host.render ? host.render(form, presentation) : <FormPreview key={JSON.stringify(form.fields)} form={form} preparing={host.preparing} />;
}
/** The preview reuses the Forms field and step implementations, without mounting
 * mutation hooks, autosave, CAPTCHA scripts, analytics or payment effects. */
function FormPreview({ form, preparing }: { form: EmbeddedForm; preparing: boolean }) {
  const prefix = useId(), [page, setPage] = useState(0);
  const steps = deriveSteps(form.fields), index = Math.min(page, Math.max(0, steps.length - 1));
  const step = steps[index], values = deriveInitialValues(form.fields);
  const fields = selectVisibleFields(form.fields, values, step ? new Set(step.fieldKeys) : null);
  return <div className="cp-embedded-form-preview">
    {!form.availability.open && <p role="status">{form.availability.message || "This form is not currently accepting responses."}</p>}
    {steps.length > 1 && <div className="cp-embedded-form-step"><span>Step {index + 1} of {steps.length}</span><strong>{step?.title}</strong></div>}
    <fieldset disabled aria-label={`${form.title} preview`}>
      {fields.map(field => <FormFieldRenderer key={field._id} field={field} value={values[field.key] ?? ""} onChange={() => {}} inputId={`${prefix}-${field.key}`} />)}
    </fieldset>
    <div className="cp-embedded-form-actions">
      {steps.length > 1 && <><button type="button" disabled={index === 0} onClick={() => setPage(index - 1)}>Previous step</button><button type="button" disabled={index >= steps.length - 1} onClick={() => setPage(index + 1)}>Next step</button></>}
      <button type="button" disabled>Submit response</button>
    </div>
    <p role="status" className="cp-embedded-form-notice">{preparing ? "Preparing form…" : "Form preview — responses are not sent."}</p>
  </div>;
}
