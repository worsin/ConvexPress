/**
 * Field Type Registry - Maps field type slugs to components
 *
 * Each component renders both the settings UI (for the builder)
 * and the value input UI (for the content editor metabox).
 */

import { FieldText } from "./FieldText";
import { FieldTextarea } from "./FieldTextarea";
import { FieldNumber } from "./FieldNumber";
import { FieldRange } from "./FieldRange";
import { FieldEmail } from "./FieldEmail";
import { FieldUrl } from "./FieldUrl";
import { FieldPassword } from "./FieldPassword";
import { FieldImage } from "./FieldImage";
import { FieldFile } from "./FieldFile";
import { FieldWysiwyg } from "./FieldWysiwyg";
import { FieldOembed } from "./FieldOembed";
import { FieldGallery } from "./FieldGallery";
import { FieldSelect } from "./FieldSelect";
import { FieldCheckbox } from "./FieldCheckbox";
import { FieldRadio } from "./FieldRadio";
import { FieldButtonGroup } from "./FieldButtonGroup";
import { FieldTrueFalse } from "./FieldTrueFalse";
import { FieldLink } from "./FieldLink";
import { FieldPostObject } from "./FieldPostObject";
import { FieldPageLink } from "./FieldPageLink";
import { FieldRelationship } from "./FieldRelationship";
import { FieldTaxonomy } from "./FieldTaxonomy";
import { FieldUser } from "./FieldUser";
import { FieldDatePicker } from "./FieldDatePicker";
import { FieldDateTimePicker } from "./FieldDateTimePicker";
import { FieldTimePicker } from "./FieldTimePicker";
import { FieldColorPicker } from "./FieldColorPicker";
import { FieldMessage } from "./FieldMessage";
import { FieldAccordion } from "./FieldAccordion";
import { FieldTab } from "./FieldTab";
import { FieldGroup } from "./FieldGroup";
import { FieldRepeater } from "./FieldRepeater";
import { FieldFlexibleContent } from "./FieldFlexibleContent";
import { FieldCalculation } from "./FieldCalculation";
import { FieldProduct } from "./FieldProduct";

export interface FieldRendererProps {
  /** The field definition */
  field: {
    _id: string;
    label: string;
    name: string;
    key: string;
    type: string;
    instructions?: string;
    required: boolean;
    defaultValue?: string;
    settings: string;
  };
  /** Current value (JSON string) */
  value: string;
  /** Value change handler */
  onChange: (value: string) => void;
  /** Label placement */
  labelPlacement?: "top" | "left";
  /** Instruction placement */
  instructionPlacement?: "label" | "field";
}

/** Registry mapping field type slugs to their renderer components */
export const FIELD_RENDERERS: Record<
  string,
  React.ComponentType<FieldRendererProps>
> = {
  text: FieldText,
  textarea: FieldTextarea,
  number: FieldNumber,
  range: FieldRange,
  email: FieldEmail,
  url: FieldUrl,
  password: FieldPassword,
  image: FieldImage,
  file: FieldFile,
  wysiwyg: FieldWysiwyg,
  oembed: FieldOembed,
  gallery: FieldGallery,
  select: FieldSelect,
  checkbox: FieldCheckbox,
  radio: FieldRadio,
  button_group: FieldButtonGroup,
  true_false: FieldTrueFalse,
  link: FieldLink,
  post_object: FieldPostObject,
  page_link: FieldPageLink,
  relationship: FieldRelationship,
  taxonomy: FieldTaxonomy,
  user: FieldUser,
  date_picker: FieldDatePicker,
  date_time_picker: FieldDateTimePicker,
  time_picker: FieldTimePicker,
  color_picker: FieldColorPicker,
  message: FieldMessage,
  accordion: FieldAccordion,
  tab: FieldTab,
  group: FieldGroup,
  repeater: FieldRepeater,
  flexible_content: FieldFlexibleContent,
  // Computed types (Form Calculation & Pricing System) — read-only displays.
  calculation: FieldCalculation,
  product: FieldProduct,
};
