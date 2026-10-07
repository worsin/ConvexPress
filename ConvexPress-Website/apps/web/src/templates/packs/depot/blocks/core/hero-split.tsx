import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import {
	Prose,
	Action,
	ResolvedImage,
} from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
export default defineBlock("core/hero-split", ({ attrs, resources, treatment }) => {
	// Legacy left/right controls DOM order, including the stacked layout.
	// An explicitly edited modern start/end value takes precedence.
	const originalMediaFirst = attrs.mediaSide === undefined && treatment?.values.mediaSide === "left";
	const reverse = attrs.mediaSide === "start";
	const copy = (
		<P.Stack gap="md">
			{attrs.eyebrow && <P.Eyebrow>{attrs.eyebrow}</P.Eyebrow>}
			{attrs.title && (
				<P.Heading level={1} size="display">
					{attrs.title}
				</P.Heading>
			)}
			{attrs.body && <Prose text={attrs.body} />}
			{(attrs.primaryCtaLabel ||
				attrs.primaryCtaUrl ||
				attrs.secondaryCtaLabel ||
				attrs.secondaryCtaUrl) && (
				<P.Stack direction="horizontal" gap="sm" wrap>
					<Action label={attrs.primaryCtaLabel} href={attrs.primaryCtaUrl} />
					<Action
						variant="outline" label={attrs.secondaryCtaLabel}
						href={attrs.secondaryCtaUrl}
					/>
				</P.Stack>
			)}
		</P.Stack>
	);
	const media = (
		<div className="depot-hero-image">
						<ResolvedImage
							id={attrs.mediaId}
							alt={attrs.mediaAlt || (treatment ? attrs.title ?? "" : "")}
							resources={resources}
						/>
					</div>
	);

	return (
		<div className="depot-hero" data-has-image={!!attrs.mediaId}>
			{attrs.mediaId ? (
				<P.Split ratio="equal" reverse={reverse} gap="md" align="center">
					{originalMediaFirst ? media : copy}
					{originalMediaFirst ? copy : media}
				</P.Split>
			) : (
				copy
			)}
		</div>
	);
});
