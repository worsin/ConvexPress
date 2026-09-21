/** Staged Library treatment. No legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	resolvedAsset,
	directVideoSource,
	Transcript,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/media";
export default defineBlock("core/video", ({ attrs, resources }) => {
	const media = attrs.media
		? resolvedAsset(attrs.media.id, resources, "video")
		: undefined;
	const src =
		media?.src ?? (attrs.url ? directVideoSource(attrs.url.href) : undefined);
	if (!src) return <P.Text tone="muted">Choose a video to display.</P.Text>;
	const poster = attrs.poster
		? resolvedAsset(attrs.poster.id, resources, "image")
		: undefined;
	return (
		<P.Stack gap="md">
			<P.Video
				src={src}
				title={attrs.title.trim() || attrs.url?.label.trim() || "Video"}
				poster={poster?.src}
				captions={media?.captions}
			/>
			<Transcript link={attrs.transcript} />
		</P.Stack>
	);
});
