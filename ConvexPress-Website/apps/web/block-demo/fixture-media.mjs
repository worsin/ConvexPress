export function bindFixtureMedia(value, path) {
	if (!value || typeof value !== "object" || !path.length) return;
	const [head, ...tail] = path;
	if (head === "*") {
		if (Array.isArray(value))
			for (const item of value) bindFixtureMedia(item, tail);
		return;
	}
	if (!Object.hasOwn(value, head)) return;
	if (tail.length) bindFixtureMedia(value[head], tail);
	else {
		const record = value;
		// Empty canonical media means no dependency, never an invented fixture photo.
		if (typeof record[head] !== "string" || !record[head].trim()) return;
		const original = String(record[head]);
		record[head] = [
			"demo-image-after",
			"demo-image-aster-mark",
			"demo-image-camp-mug",
			"demo-image-field-notebook",
			"demo-image-retreat",
		].includes(original)
			? original
			: original.startsWith("demo-video-")
				? "demo-video"
				: original.startsWith("demo-audio-")
					? "demo-audio"
					: original.startsWith("demo-file-")
						? "demo-file"
						: "demo-workshop";
	}
}
