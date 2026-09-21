const assets = import.meta.glob<string>(
	"../../../../ConvexPress-Admin/apps/web/public/block-thumbnails/*/*.jpg",
	{ eager: true, query: "?url", import: "default" },
);
export function catalogThumbnail(
	packId: string,
	blockName: string,
): string | undefined {
	return assets[
		`../../../../ConvexPress-Admin/apps/web/public/block-thumbnails/${packId}/${blockName.replaceAll("/", "--")}.jpg`
	];
}
