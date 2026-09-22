import { HeroComposition } from "../../../../sdk/block-renderer/hero-composition";
import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import {
	Prose,
	Action,
	ResolvedImage,
} from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
export default defineBlock("core/hero", ({ attrs, resources, style }) => {
	if (style === "editorial" || style === "poster") return <div className="cp-hero-treatment journal-hero-treatment"><HeroComposition attrs={attrs} resources={resources} variant={style} /></div>;
	const copy = (
		<P.Stack gap="lg">
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
	return (
		<div className="journal-hero" data-has-image={!!attrs.mediaId}>
			{attrs.mediaId ? (
				<P.Split ratio="two-one" gap="lg" align="center">
					{copy}
					<div className="journal-hero-image">
						<ResolvedImage
							id={attrs.mediaId}
							alt={undefined}
							resources={resources}
						/>
					</div>
				</P.Split>
			) : (
				copy
			)}
		</div>
	);
});
