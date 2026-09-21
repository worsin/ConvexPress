import type { ContactDefinition } from "./foundation/contactContracts";
type ContactFieldProjection = { label: string; name: string; key: string; type: "text" | "email" | "textarea" | "select"; required: boolean; settings: string; menuOrder: number };
/** Shared by authoring projection and public source verification. */
export function contactFieldProjection(field: ContactDefinition["fields"][number], formId: string, menuOrder: number): ContactFieldProjection {
  return {label:field.label,name:field.name,key:`field_contact_${formId}_${field.name}`,type:field.type==="tel"?"text":field.type,required:field.required,
    settings:JSON.stringify({placeholder:field.placeholder,...(field.type==="tel"?{inputType:"tel"}:{}),...(field.type==="select"?{choices:field.options.map(option=>({label:option,value:option}))}:{})}),menuOrder};
}
