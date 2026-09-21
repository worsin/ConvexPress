import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { ConsentEmbed } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/consent-embed";
import {
	Intro,
	Action,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
export default defineBlock("core/booking-cta", ({ attrs }) => (
	<div className="cp-library-booking" data-embed={Boolean(attrs.embedUrl)}>
		<div className="cp-library-booking-copy">
			<P.Stack gap="lg">
				<Intro
					eyebrow={attrs.eyebrow}
					heading={attrs.heading}
					body={attrs.body}
				/>
				{attrs.ctaUrl && <Action label={attrs.ctaLabel} href={attrs.ctaUrl} />}
			</P.Stack>
		</div>
		{attrs.embedUrl && (
			<ConsentEmbed
				url={attrs.embedUrl}
				title={attrs.heading || "Choose a time"}
				kind="scheduler"
			/>
		)}
	</div>
));
