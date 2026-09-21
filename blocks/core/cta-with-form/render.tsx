import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { NewsletterForm } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/newsletter";
import { Intro } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
export default defineBlock("core/cta-with-form", ({ attrs }) => (
	<div className="cp-library-signup" data-kind="cta">
		<Intro eyebrow={attrs.eyebrow} heading={attrs.heading} body={attrs.body} />
		<NewsletterForm
			placeholder={attrs.placeholder}
			submitLabel={attrs.submitLabel}
		/>
		{attrs.fineprint && (
			<P.Text size="sm" tone="muted">
				{attrs.fineprint}
			</P.Text>
		)}
	</div>
));
