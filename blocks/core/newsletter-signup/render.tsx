import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { NewsletterForm } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/newsletter";
import { Intro } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/newsletter-signup", ({ attrs }) => (
	<div className="cp-library-signup">
		<Intro eyebrow={attrs.eyebrow} heading={attrs.heading} body={attrs.body} />
		<NewsletterForm
			placeholder={attrs.placeholder}
			submitLabel={attrs.submitLabel}
			successMessage={attrs.successMessage}
		/>
	</div>
));
