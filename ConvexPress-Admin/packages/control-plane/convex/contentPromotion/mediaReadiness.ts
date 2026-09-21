import { storageSha256Hex } from "@convexpress/site-contract";
import type { ContentPromotionManifest } from "@convexpress/site-contract/content-promotion";
import type { BrokerRequest, ReviewResult } from "./policy";
/** New target proofs must match reviewed bytes and the exact resolution path. Legacy receipts retain the old explicit-binding requirement. */
export function mediaReadiness(
	manifest: ContentPromotionManifest,
	request: BrokerRequest,
	review: ReviewResult,
) {
	const media = manifest.records.filter((record) => record.kind === "media");
	const supplied = new Map(
		request.mediaBindings.map((binding) => [binding.key, binding.storageId]),
	);
	const keys = new Set(media.map((record) => record.key));
	let valid =
		request.mediaBindings.length === supplied.size &&
		[...supplied.keys()].every((key) => keys.has(key));
	let provided = 0;
	if (review.verifiedMedia === undefined) {
		provided = media.filter((record) => supplied.has(record.key)).length;
	} else {
		const resolved = new Set<string>();
		for (const proof of review.verifiedMedia) {
			const record = media.find((record) => record.key === proof.key),
				change = review.changes.find((item) => item.key === proof.key);
			let bytesMatch = false;
			try {
				bytesMatch =
					!!record &&
					storageSha256Hex(String(record.data.sha256)) ===
						storageSha256Hex(proof.sha256) &&
					record.data.fileSize === proof.fileSize;
			} catch {
				/* Invalid or differently represented hashes cannot establish proof. */
			}
			if (
				!record ||
				resolved.has(proof.key) ||
				!change ||
				change.kind !== "media" ||
				change.targetId !== proof.targetId ||
				!bytesMatch ||
				(proof.resolution === "binding"
					? supplied.get(proof.key) !== proof.storageId
					: !proof.targetId || supplied.has(proof.key))
			) {
				valid = false;
				continue;
			}
			resolved.add(proof.key);
		}
		provided = resolved.size;
	}
	const ready =
		valid &&
		provided === media.length &&
		!review.issues.some((issue) => /MEDIA|STORAGE|BLOB/.test(issue.code));
	return { valid, provided, ready };
}
