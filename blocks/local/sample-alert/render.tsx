/** Staged canonical Library view; no query/provider or legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Prose,
	Action,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/editorial.css";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/media-details.css";

export default defineBlock("local/sample-alert", ({ attrs }) => (
	<aside className="cp-library-alert" data-variant={attrs.variant}>
		<P.Stack gap="md">
			<P.Eyebrow>{attrs.variant}</P.Eyebrow>
			{attrs.heading && (
				<P.Heading level={2} size="md">
					{attrs.heading}
				</P.Heading>
			)}
			{attrs.body && <Prose text={attrs.body} />}
			<Action label={attrs.ctaLabel} href={attrs.ctaUrl} />
		</P.Stack>
	</aside>
));
