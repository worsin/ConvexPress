import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import {
	Intro,
	Action,
	ResolvedImage,
} from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
export default defineBlock("blocks/page-banner", ({ attrs, resources }) => (
	<div className="journal-banner">
		<P.Stack gap="lg">
			{attrs.breadcrumbLabel && (
				<P.Text size="sm" tone="muted">
					{attrs.breadcrumbLabel}
				</P.Text>
			)}
			<P.Split ratio="two-one" gap="lg" align="center">
				<Intro
					eyebrow={attrs.eyebrow}
					heading={attrs.title}
					body={attrs.subtitle}
				/>
				<Action label={attrs.ctaLabel} href={attrs.ctaUrl} />
			</P.Split>
			{attrs.mediaId && (
				<div className="journal-banner-image">
					<ResolvedImage
						id={attrs.mediaId}
						alt={attrs.mediaAlt || undefined}
						resources={resources}
					/>
				</div>
			)}
		</P.Stack>
	</div>
));
