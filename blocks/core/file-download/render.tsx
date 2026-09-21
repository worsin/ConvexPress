/** Staged Library treatment. No legacy activation. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	resolvedAsset,
	fileSize,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/media";
import "./file.css";
export default defineBlock("core/file-download", ({ attrs, resources }) => {
	if (!attrs.media)
		return <P.Text tone="muted">Choose a file to offer for download.</P.Text>;
	const media = resolvedAsset(attrs.media.id, resources, "file");
	const title = attrs.title.trim() || media.filename || "Download file";
	return (
		<P.Card>
			<P.Stack gap="md">
				<P.Eyebrow>Resource</P.Eyebrow>
				<P.Heading level={3} size="lg">
					{title}
				</P.Heading>
				{attrs.description && <P.Text>{attrs.description}</P.Text>}
				<P.Text size="sm" tone="muted">
					{[
						media.filename,
						media.mimeType,
						media.byteSize !== undefined ? fileSize(media.byteSize) : undefined,
					]
						.filter(Boolean)
						.join(" · ")}
				</P.Text>
				<a
					className="cp-library-download"
					href={media.src}
					download={media.filename || true}
				>
					{title}
					<span aria-hidden="true"> ↓</span>
				</a>
			</P.Stack>
		</P.Card>
	);
});
