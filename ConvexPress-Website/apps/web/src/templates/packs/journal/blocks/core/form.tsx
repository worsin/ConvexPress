import { defineDataBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import { Intro } from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
import { EmbeddedFormBody } from "../../../../sdk/block-renderer/form-embed";
export default defineDataBlock("core/form", "forms.form", ({ attrs, data }) => (
	<div className="journal-form cp-embedded-form">
		{data.form ? (
			<P.Split ratio="one-two" gap="lg">
				<Intro
					heading={attrs.title || data.form.title}
					body={data.form.description || ""}
				/>
				<div className="journal-form-fields">
					<EmbeddedFormBody form={data.form} />
				</div>
			</P.Split>
		) : (
			<P.Text>This form is not currently available.</P.Text>
		)}
	</div>
));
