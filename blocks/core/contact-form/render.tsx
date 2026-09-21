import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { ContactFormBody } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/contact-form";
export default defineDataBlock("core/contact-form", "forms.contact", ({ attrs, data }) => <ContactFormBody attrs={attrs} form={data.form} />);
