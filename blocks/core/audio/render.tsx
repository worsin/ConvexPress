/** Staged Library treatment. No legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	resolvedAsset,
	Transcript,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/media";
import "./media.css";
export default defineBlock("core/audio", ({ attrs, resources }) => {
	if (!attrs.media)
		return <P.Text tone="muted">Choose an audio recording to display.</P.Text>;
	const media = resolvedAsset(attrs.media.id, resources, "audio");
	const title = attrs.title.trim() || "Audio recording";
	return (
		<P.Card>
			<P.Stack gap="md">
				<P.Eyebrow>Listen</P.Eyebrow>
				<P.Heading level={3} size="lg">
					{title}
				</P.Heading>
				{/* biome-ignore lint/a11y/useMediaCaption: Transcript and caption track are optional canonical inputs; render them only when authored, without inventing captions. */}
				<audio
					className="cp-library-audio"
					controls
					preload="none"
					aria-label={title}
					src={media.src}
				>
					{media.captions && (
						<track
							kind="captions"
							src={media.captions.src}
							srcLang={media.captions.language}
							label={media.captions.label}
							default
						/>
					)}
					<a href={media.src}>Download {title}</a>
				</audio>
				<Transcript link={attrs.transcript} />
			</P.Stack>
		</P.Card>
	);
});
