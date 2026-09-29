import * as P from "../primitives";
import { BlockRenderError, type RenderResources } from "./model";
import type { RenderMedia } from "./media-resources";

import { supportedVideoUrl, supportedMediaType, type MediaKind } from "../block-data/portable/libraryPresentation";
export function resolvedAsset(
	id: string,
	resources: RenderResources,
	kind: MediaKind,
): RenderMedia {
	if (!Object.hasOwn(resources.media, id))
		throw new BlockRenderError(
			"UNRESOLVED_MEDIA",
			kind,
			"Resolve the public target media identity before rendering",
		);
	const asset = resources.media[id];
	if (
		!supportedMediaType(kind, asset.mimeType)
	)
		throw new BlockRenderError(
			"UNSUPPORTED_MEDIA_TYPE",
			kind,
			`Expected ${kind} media; the public media adapter must provide a supported MIME type`,
		);
	return asset;
}
export function directVideoSource(href: string): string {
	const url = new URL(href);
	if (
		!supportedVideoUrl(url)
	)
		throw new BlockRenderError(
			"UNSUPPORTED_VIDEO_URL",
			"core/video",
			"Use a direct HTTPS MP4, WebM or Ogg video file, or resolve owned video media; provider embeds require a separate approved adapter",
		);
	return url.href;
}
export function Transcript({
	link,
}: {
	link?: { href: string; label: string; newTab?: boolean };
}) {
	return link ? (
		<P.Link
			href={link.href}
			label={link.label.trim() || "Read transcript"}
			newTab={link.newTab}
		/>
	) : null;
}
export function fileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
