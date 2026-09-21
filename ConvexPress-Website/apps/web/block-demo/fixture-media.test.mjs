import { test } from "node:test";
import assert from "node:assert/strict";
import { bindFixtureMedia } from "./fixture-media.mjs";

test("demo media binding preserves missing, null and empty canonical media sentinels", () => {
	for (const original of [{}, { mediaId: "" }, { mediaId: null }]) {
		const bound = structuredClone(original);
		bindFixtureMedia(bound, ["mediaId"]);
		assert.deepEqual(bound, original);
	}
	const nested = {
		items: [
			{ media: null },
			{ media: { id: "", alt: "No supplied image" } },
			{ media: { id: "demo-image-camp-mug", alt: "A real fixture" } },
		],
	};
	const original = structuredClone(nested);
	bindFixtureMedia(nested, ["items", "*", "media", "id"]);
	assert.deepEqual(nested, original);
});
test("nonempty declared media identities retain typed local fixture mapping", () => {
	const value = {
		items: [
			{ id: "demo-video-field-notes" },
			{ id: "demo-audio-morning-notes" },
			{ id: "demo-file-notes" },
			{ id: "demo-image-retreat" },
			{ id: "demo-image-aster-mark" },
			{ id: "demo-image-before" },
			{ id: "demo-image-after" },
		],
	};
	bindFixtureMedia(value, ["items", "*", "id"]);
	assert.deepEqual(
		value.items.map((item) => item.id),
		[
			"demo-video",
			"demo-audio",
			"demo-file",
			"demo-image-retreat",
			"demo-image-aster-mark",
			"demo-workshop",
			"demo-image-after",
		],
	);
});
