import type { BlockProps } from "./model";
import * as P from "../primitives";
import { Action, Prose, ResolvedImage } from "./presentation";
import "./hero-composition.css";

/** Shared composition mechanics; each installed pack owns its treatment and tokens. */
export function HeroComposition({ attrs, resources, variant }: Pick<BlockProps<"core/hero">, "attrs" | "resources"> & { variant: "editorial" | "poster" }) {
	const hasActions = !!(attrs.primaryCtaLabel || attrs.primaryCtaUrl || attrs.secondaryCtaLabel || attrs.secondaryCtaUrl);
	const hasSummary = !!attrs.body || hasActions;
	return (
		<div className="cp-hero-composition" data-hero-style={variant} data-has-media={!!attrs.mediaId} data-has-summary={hasSummary}>
			{(attrs.eyebrow || attrs.title) && <header className="cp-hero-composition-heading">
				{attrs.eyebrow && <P.Eyebrow>{attrs.eyebrow}</P.Eyebrow>}
				{attrs.title && <P.Heading level={1} size="display">{attrs.title}</P.Heading>}
			</header>}
			{hasSummary && <div className="cp-hero-composition-summary">
				{attrs.body && <Prose text={attrs.body} />}
				{hasActions && <P.Stack direction="horizontal" gap="sm" wrap>
					<Action label={attrs.primaryCtaLabel} href={attrs.primaryCtaUrl} />
					<Action variant="outline" label={attrs.secondaryCtaLabel} href={attrs.secondaryCtaUrl} />
				</P.Stack>}
			</div>}
			{attrs.mediaId && <div className="cp-hero-composition-media"><ResolvedImage id={attrs.mediaId} resources={resources} /></div>}
		</div>
	);
}
