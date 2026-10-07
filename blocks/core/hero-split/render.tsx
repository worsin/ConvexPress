import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Prose,
	Action,
	ResolvedImage,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/hero-split", ({ attrs, resources, treatment }) => {
	// Legacy left/right controls DOM order, including the stacked layout.
	// An explicitly edited modern start/end value takes precedence.
	const originalMediaFirst = attrs.mediaSide === undefined && treatment?.values.mediaSide === "left";
	const reverse = attrs.mediaSide === "start";
	const copy = (
		<P.Stack gap="lg">
			{attrs.eyebrow && <P.Eyebrow>{attrs.eyebrow}</P.Eyebrow>}
			{attrs.title && (
				<P.Heading level={1} size="display">
					{attrs.title}
				</P.Heading>
			)}
			{attrs.body && <Prose text={attrs.body} />}
			<P.Stack direction="horizontal" gap="md" wrap>
				<Action label={attrs.primaryCtaLabel} href={attrs.primaryCtaUrl} />
				<Action variant="outline" label={attrs.secondaryCtaLabel} href={attrs.secondaryCtaUrl} />
			</P.Stack>
		</P.Stack>
	);
	const media = (
		<ResolvedImage
				id={attrs.mediaId}
				alt={attrs.mediaAlt || (treatment ? attrs.title ?? "" : "")}
				resources={resources}
			/>
	);

	return attrs.mediaId ? (
		<P.Split gap="lg" reverse={reverse}>
			{originalMediaFirst ? media : copy}
			{originalMediaFirst ? copy : media}
		</P.Split>
	) : (
		copy
	);
});
