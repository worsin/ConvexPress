import { EmbeddedFormBody, useFormEmbedHost } from "./form-embed";
import type { EmbeddedForm } from "../block-data/portable/formContracts";
import { useId } from "react";
import { ArrowUpRight } from "lucide-react";
import { parseContactDefinition, type ContactDefinition } from "../block-data/portable/contactContracts";
import { Intro } from "./presentation";
import "./contact-form.css";

/** Account-free saved preview. The submission host is deliberately gated until
 * the server-owned Forms binding is installed; no native form or recipient URL. */
export function ContactFormPreview({ attrs }: { attrs: ContactDefinition }) {
  const id = useId();
  let definition: ContactDefinition;
  try { definition = parseContactDefinition(attrs); }
  catch { return <p role="status">This contact form needs its field configuration reviewed.</p>; }
  return <div className="cp-library-contact-shell"><div className="cp-library-contact">
    <div className="cp-library-contact-intro"><Intro eyebrow={definition.eyebrow} heading={definition.heading} body={definition.body} /></div>
    <div className="cp-library-contact-body">
      {definition.fields.length ? <>
        <fieldset disabled aria-label="Contact form preview" className="cp-library-contact-fields">
          {definition.fields.map((field, index) => {
            const inputId = `${id}-contact-${index}`;
            const common = { id: inputId, name: field.name, required: field.required, placeholder: field.placeholder, 'aria-required': field.required };
            return <div key={field.name} className="cp-library-contact-field" data-wide={field.type === "textarea" || field.type === "select" || undefined}>
              <label htmlFor={inputId}>{field.label}{field.required && <span aria-hidden="true"> *</span>}</label>
              {field.type === "textarea" ? <textarea {...common} rows={5} maxLength={8000} /> : field.type === "select" ?
                <select {...common} defaultValue=""><option value="" disabled>{field.placeholder || "Choose an option"}</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select> :
                <input {...common} type={field.type} maxLength={field.type === "email" ? 254 : 1000} />}
            </div>;
          })}
        </fieldset>
        <div className="cp-library-contact-footer"><p>Fields marked * are required.</p><button type="button" disabled>{definition.submitLabel || "Send message"}<ArrowUpRight aria-hidden="true" size={18} /></button></div>
        <p className="cp-library-contact-notice" role="status">Form preview — responses are not sent.</p>
      </> : <p role="status">Add fields to your contact form to see them here.</p>}
    </div>
  </div></div>;
}


export function ContactFormBody({ attrs, form }: { attrs: ContactDefinition; form: EmbeddedForm | null }) {
  const host = useFormEmbedHost();
  if (!host.render) return <ContactFormPreview attrs={attrs} />;
  return <div className="cp-library-contact-shell"><div className="cp-library-contact">
    <div className="cp-library-contact-intro"><Intro eyebrow={attrs.eyebrow} heading={attrs.heading} body={attrs.body} /></div>
    <div className="cp-library-contact-body cp-embedded-form">
      {form ? <EmbeddedFormBody form={form} presentation={{ submitLabel: attrs.submitLabel || "Send message", autosave: false }} /> :
        <p role="status">This contact form is not currently available. Please try again later.</p>}
    </div>
  </div></div>;
}
