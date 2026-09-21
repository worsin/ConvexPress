/** Staged canonical Library view; no legacy or provider activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Intro,
	Action,
	ResolvedImage,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/editorial.css";
export default defineBlock("blocks/page-banner", ({ attrs, resources }) => (
	<div className="cp-editorial-banner">
		<P.Stack gap="lg">
			{attrs.breadcrumbLabel && (
				<P.Text size="sm" tone="muted">
					{attrs.breadcrumbLabel}
				</P.Text>
			)}
			<Intro
				eyebrow={attrs.eyebrow}
				heading={attrs.title}
				body={attrs.subtitle}
			/>
			<Action label={attrs.ctaLabel} href={attrs.ctaUrl} />
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
