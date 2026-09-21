import { normalizeDeploymentOrigin, storageSha256Hex } from "@convexpress/site-contract";
/** Small original-image transfer only. Transport callers must supply a freshly reviewed descriptor. */
export const MAX_MEDIA_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_MEDIA_TOTAL_BYTES = 4 * 1024 * 1024;
export const MAX_MEDIA_FILES = 8;
export type MediaDescriptor = {
	key: string;
	sha256: string;
	fileSize: number;
	mimeType: string;
};
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
export class MediaTransferError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}
function refuse(code: string): never {
	throw new MediaTransferError(code);
}
export function validateMediaBatch(files: MediaDescriptor[]) {
	if (
		!files.length ||
		files.length > MAX_MEDIA_FILES ||
		new Set(files.map((file) => file.key)).size !== files.length
	)
		refuse("MEDIA_BATCH_LIMIT");
	let total = 0;
	for (const file of files) {
		if (
			!/^media:[A-Za-z0-9_-]{1,200}$/.test(file.key) ||
			!Number.isSafeInteger(file.fileSize) ||
			file.fileSize < 1 ||
			file.fileSize > MAX_MEDIA_FILE_BYTES ||
			!TYPES.has(file.mimeType)
		)
			refuse("MEDIA_DESCRIPTOR_INVALID");
		storageSha256Hex(file.sha256);
		total += file.fileSize;
	}
	if (total > MAX_MEDIA_TOTAL_BYTES) refuse("MEDIA_BATCH_LIMIT");
	return total;
}
function nativeUrl(raw: string, origin: string) {
	if (typeof raw !== "string" || raw.length > 4000) refuse("MEDIA_URL_INVALID");
	try {
		const url = new URL(raw);
		if (
			normalizeDeploymentOrigin(origin) !== origin ||
			url.origin !== origin ||
			url.username ||
			url.password ||
			url.hash ||
			url.href !== raw
		)
			refuse("MEDIA_URL_INVALID");
		return url;
	} catch {
		return refuse("MEDIA_URL_INVALID");
	}
}
export function sourceStorageUrl(raw: string, sourceOrigin: string) {
	const url = nativeUrl(raw, sourceOrigin);
	if (
		!/^\/api\/storage\/[A-Za-z0-9_-]{1,200}$/.test(url.pathname) ||
		url.pathname.endsWith("/upload") ||
		url.search
	)
		refuse("MEDIA_URL_INVALID");
	return url.href;
}
export function targetStorageUploadUrl(raw: string, targetOrigin: string) {
	const url = nativeUrl(raw, targetOrigin);
	if (
		url.pathname !== "/api/storage/upload" ||
		[...url.searchParams.keys()].join(",") !== "token" ||
		!url.searchParams.get("token") ||
		url.searchParams.get("token")!.length > 3000
	)
		refuse("MEDIA_URL_INVALID");
	return url.href;
}
function signatureMatches(bytes: Uint8Array, mimeType: string) {
	if (mimeType === "image/png")
		return [137, 80, 78, 71, 13, 10, 26, 10].every(
			(byte, index) => bytes[index] === byte,
		);
	if (mimeType === "image/jpeg")
		return (
			bytes.length >= 3 &&
			bytes[0] === 255 &&
			bytes[1] === 216 &&
			bytes[2] === 255
		);
	return (
		bytes.length >= 12 &&
		String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
		String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
	);
}
export async function readReviewedMedia(
	response: Response,
	file: MediaDescriptor,
): Promise<Uint8Array<ArrayBuffer>> {
	validateMediaBatch([file]);
	if (
		response.status !== 200 ||
		response.redirected ||
		(response.headers.get("content-encoding") &&
			response.headers.get("content-encoding") !== "identity")
	)
		refuse("MEDIA_RESPONSE_INVALID");
	if (
		response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
		file.mimeType
	)
		refuse("MEDIA_TYPE_MISMATCH");
	const declared = response.headers.get("content-length");
	if (
		declared !== null &&
		(!/^\d+$/.test(declared) || Number(declared) !== file.fileSize)
	)
		refuse("MEDIA_SIZE_MISMATCH");
	const reader = response.body?.getReader();
	if (!reader) refuse("MEDIA_RESPONSE_INVALID");
	const bytes = new Uint8Array(file.fileSize);
	let offset = 0;
	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) break;
			if (chunk.value.byteLength > bytes.length - offset)
				refuse("MEDIA_SIZE_MISMATCH");
			bytes.set(chunk.value, offset);
			offset += chunk.value.byteLength;
		}
		if (offset !== bytes.length) refuse("MEDIA_SIZE_MISMATCH");
		if (!signatureMatches(bytes, file.mimeType)) refuse("MEDIA_TYPE_MISMATCH");
		const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
		const hex = Array.from(digest, (byte) =>
			byte.toString(16).padStart(2, "0"),
		).join("");
		if (hex !== storageSha256Hex(file.sha256)) refuse("MEDIA_HASH_MISMATCH");
		return bytes;
	} catch (error) {
		await reader.cancel().catch(() => {});
		throw error;
	} finally {
		reader.releaseLock();
	}
}
export type TransferCheckpoint = {
	phase:
		| "planned"
		| "downloading"
		| "uploading"
		| "uploaded"
		| "verified"
		| "uncertain";
	storageId?: string;
};
export function nextTransferStep(
	checkpoint: TransferCheckpoint,
): "download" | "complete" | "read-status" | "reconcile" {
	if (checkpoint.phase === "verified") return "read-status";
	if (checkpoint.storageId) return "complete";
	if (
		checkpoint.phase === "uploading" ||
		checkpoint.phase === "uncertain" ||
		checkpoint.phase === "uploaded"
	)
		return "reconcile";
	return "download";
}
