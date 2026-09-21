/** Staged canonical Library view; no legacy or provider activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Intro,
	Action,
	ResolvedImage,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/editorial.css";
export default defineBlock("blocks/promo-band", ({ attrs, resources }) => (
	<div className="cp-editorial-pair" data-media={Boolean(attrs.mediaId)}>
		<P.Stack gap="lg">
			<Intro
				eyebrow={attrs.eyebrow}
				heading={attrs.heading}
				body={attrs.body}
			/>
			{attrs.details.length > 0 && (
				<dl className="cp-editorial-detail-list">
					{attrs.details.map((item, index) => (
						<div key={index}>
							<dt>{item.label}</dt>
							<dd>{item.value}</dd>
						</div>
					))}
				</dl>
			)}
			<P.Stack direction="horizontal" gap="md">
				<Action label={attrs.primaryCtaLabel} href={attrs.primaryCtaUrl} />
				<Action label={attrs.secondaryCtaLabel} href={attrs.secondaryCtaUrl} />
			</P.Stack>
		</P.Stack>
		{attrs.mediaId && (
			<ResolvedImage
				id={attrs.mediaId}
				alt={attrs.mediaAlt || undefined}
				resources={resources}
			/>
		)}
	</div>
));
