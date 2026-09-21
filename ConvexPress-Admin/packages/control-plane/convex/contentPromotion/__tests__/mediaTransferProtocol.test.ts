import { expect, test } from "bun:test";
import {
	MAX_MEDIA_FILE_BYTES,
	nextTransferStep,
	readReviewedMedia,
	sourceStorageUrl,
	targetStorageUploadUrl,
	validateMediaBatch,
	type MediaDescriptor,
} from "../mediaTransferProtocol";
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
async function descriptor(bytes = png): Promise<MediaDescriptor> {
	return {
		key: "media:source",
		fileSize: bytes.length,
		mimeType: "image/png",
		sha256: Array.from(
			new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
			(byte) => byte.toString(16).padStart(2, "0"),
		).join(""),
	};
}
function response(bytes = png, headers: Record<string, string> = {}) {
	return new Response(bytes, {
		headers: { "content-type": "image/png", ...headers },
	});
}
test("only exact reviewed native deployment storage URLs are accepted without redirects or arbitrary endpoints", () => {
	const source = "https://source.convex.cloud";
	const target = "https://target.convex.cloud";
	expect(sourceStorageUrl(`${source}/api/storage/file123`, source)).toBe(
		`${source}/api/storage/file123`,
	);
	expect(
		targetStorageUploadUrl(
			`${target}/api/storage/upload?token=fixture-token`,
			target,
		),
	).toContain("/api/storage/upload");
	for (const url of [
		"http://source.convex.cloud/api/storage/file",
		`${target}/api/storage/file`,
		`${source}/api/storage/file?url=https://private`,
		`${source}/api/storage/upload`,
		`${source}/api/storage/%2e%2e/file`,
		`${source}/api/storage/file#fragment`,
		"https://user@source.convex.cloud/api/storage/file",
		`${source}/api/storage/../storage/file`,
	])
		expect(() => sourceStorageUrl(url, source)).toThrow();
	for (const url of [
		`${source}/api/storage/upload?token=x`,
		`${target}/api/storage/upload`,
		`${target}/api/storage/upload?token=x&token=y`,
		`${target}/api/storage/upload?token=x&redirect=bad`,
		`${target}/api/query?token=x`,
	])
		expect(() => targetStorageUploadUrl(url, target)).toThrow();
});
test("reviewed bytes must match exact streamed length, stored SHA-256 and original image type", async () => {
	const file = await descriptor();
	expect(await readReviewedMedia(response(), file)).toEqual(png);
	await expect(
		readReviewedMedia(response(png.subarray(0, 8)), file),
	).rejects.toThrow("MEDIA_SIZE_MISMATCH");
	await expect(
		readReviewedMedia(response(new Uint8Array([...png, 9])), file),
	).rejects.toThrow("MEDIA_SIZE_MISMATCH");
	await expect(
		readReviewedMedia(response(png, { "content-length": "999" }), file),
	).rejects.toThrow("MEDIA_SIZE_MISMATCH");
	await expect(
		readReviewedMedia(response(png, { "content-type": "image/svg+xml" }), file),
	).rejects.toThrow("MEDIA_TYPE_MISMATCH");
	await expect(
		readReviewedMedia(response(png, { "content-encoding": "gzip" }), file),
	).rejects.toThrow("MEDIA_RESPONSE_INVALID");
	await expect(
		readReviewedMedia(response(), { ...file, sha256: "0".repeat(64) }),
	).rejects.toThrow("MEDIA_HASH_MISMATCH");
	const html = new TextEncoder().encode("<script>x</script>");
	await expect(
		readReviewedMedia(response(html), await descriptor(html)),
	).rejects.toThrow("MEDIA_TYPE_MISMATCH");
});
test("stream overflow cancels the producer without collecting the unbounded remainder", async () => {
	let cancelled = false;
	let reads = 0;
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			reads++;
			controller.enqueue(new Uint8Array(100));
		},
		cancel() {
			cancelled = true;
		},
	});
	await expect(
		readReviewedMedia(
			new Response(stream, { headers: { "content-type": "image/png" } }),
			await descriptor(),
		),
	).rejects.toThrow("MEDIA_SIZE_MISMATCH");
	expect(cancelled).toBe(true);
	expect(reads).toBeLessThan(4);
});
test("whole-review file count and aggregate byte budget are bounded before any network operation", async () => {
	const file = await descriptor();
	expect(validateMediaBatch([file])).toBe(png.length);
	for (const files of [
		[],
		[file, file],
		[{ ...file, fileSize: MAX_MEDIA_FILE_BYTES + 1 }],
		[{ ...file, mimeType: "image/svg+xml" }],
		Array.from({ length: 9 }, (_, index) => ({
			...file,
			key: `media:id${index}`,
		})),
		Array.from({ length: 3 }, (_, index) => ({
			...file,
			key: `media:id${index}`,
			fileSize: MAX_MEDIA_FILE_BYTES,
		})),
	])
		expect(() => validateMediaBatch(files)).toThrow();
});
test("a lost raw upload result cannot request another upload or invent a storage binding", () => {
	expect(nextTransferStep({ phase: "planned" })).toBe("download");
	expect(nextTransferStep({ phase: "downloading" })).toBe("download");
	for (const phase of ["uploading", "uploaded", "uncertain"] as const)
		expect(nextTransferStep({ phase })).toBe("reconcile");
	expect(
		nextTransferStep({ phase: "uncertain", storageId: "known-storage" }),
	).toBe("complete");
	expect(
		nextTransferStep({ phase: "verified", storageId: "known-storage" }),
	).toBe("read-status");
});

test("native system-table base64 SHA-256 compares to the same bytes as hexadecimal", async () => {
	const file = await descriptor();
	const base64 = Buffer.from(file.sha256, "hex").toString("base64");
	expect(
		await readReviewedMedia(response(), { ...file, sha256: base64 }),
	).toEqual(png);
	await expect(
		readReviewedMedia(response(), { ...file, sha256: "not-a-storage-digest" }),
	).rejects.toThrow();
});

test("blob dedup identity is independent of digest encoding and changes with the source or target instance", async () => {
	const { promotionMediaTransferKey } = await import(
		"@convexpress/site-contract"
	);
	const file = await descriptor();
	const source = {
		websiteKey: "aster",
		instanceKey: "stage",
		deploymentOrigin: "https://stage.convex.cloud",
		siteOrigin: "https://stage.example",
		schemaVersion: "1",
		environmentKind: "staging" as const,
	};
	const target = {
		...source,
		instanceKey: "live",
		deploymentOrigin: "https://live.convex.cloud",
		siteOrigin: "https://live.example",
		environmentKind: "live" as const,
	};
	const media = {
		sha256: file.sha256,
		fileSize: file.fileSize,
		mimeType: "image/png" as const,
	};
	const key = promotionMediaTransferKey(source, target, media);
	expect(
		promotionMediaTransferKey(source, target, {
			...media,
			sha256: Buffer.from(file.sha256, "hex").toString("base64"),
		}),
	).toBe(key);
	expect(
		promotionMediaTransferKey(
			{ ...source, instanceKey: "another-stage" },
			target,
			media,
		),
	).not.toBe(key);
	expect(
		promotionMediaTransferKey(
			source,
			{ ...target, instanceKey: "another-live" },
			media,
		),
	).not.toBe(key);
});
