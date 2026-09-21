import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { EmbeddedFormBody } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/form-embed";
import { Intro } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";

export default defineDataBlock("core/form", "forms.form", ({ attrs, data }) => (
  <div className="cp-embedded-form">
    {data.form ? <>
      <Intro heading={attrs.title || data.form.title} body={data.form.description || ""} />
      <EmbeddedFormBody form={data.form} />
    </> : <P.Text>This form is not currently available.</P.Text>}
  </div>
));
