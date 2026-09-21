import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import {
	Intro,
	Action,
	ResolvedImage,
} from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
export default defineBlock("blocks/page-banner", ({ attrs, resources }) => (
	<div className="depot-banner">
		<P.Stack gap="md">
			{attrs.breadcrumbLabel && (
				<P.Text size="sm" tone="muted">
					{attrs.breadcrumbLabel}
				</P.Text>
			)}
			<P.Split ratio="two-one" gap="md" align="center">
				<Intro
					eyebrow={attrs.eyebrow}
					heading={attrs.title}
					body={attrs.subtitle}
				/>
				<Action label={attrs.ctaLabel} href={attrs.ctaUrl} />
			</P.Split>
			{attrs.mediaId && (
				<div className="depot-banner-image">
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
