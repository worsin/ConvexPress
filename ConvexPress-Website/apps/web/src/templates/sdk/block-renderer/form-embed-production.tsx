import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FormWizard } from "../../../extensions/forms/FormWizard";
import { FormEmbedProvider, type FormPresentation } from "./form-embed";
import type { EmbeddedForm } from "../block-data/portable/formContracts";

export function ProductionFormEmbedProvider({ children, password }: { children: ReactNode; password?: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const value = useMemo(() => ({ preparing: !ready, render: ready ? (form: EmbeddedForm, presentation?: FormPresentation) =>
    <FormWizard key={JSON.stringify([form._id, form.settings, form.fields])} form={form} contactPassword={password} options={{ embedded: true, ...presentation }} /> : null }), [ready, password]);
  return <FormEmbedProvider value={value}>{children}</FormEmbedProvider>;
}
