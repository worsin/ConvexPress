import { z } from "zod";
import { canonicalJson, sha256Hex } from "./fingerprints";
import {
	promotionIdentitySchema,
	type PromotionIdentity,
} from "./content-promotion";
export function storageSha256Hex(value: string): string {
	if (/^[a-f0-9]{64}$/.test(value)) return value;
	if (/^[A-Za-z0-9+/]{43}=$/.test(value)) {
		const decoded = atob(value);
		if (decoded.length === 32 && btoa(decoded) === value)
			return Array.from(decoded, (character) =>
				character.charCodeAt(0).toString(16).padStart(2, "0"),
			).join("");
	}
	throw new Error("MEDIA_HASH_INVALID");
}
export const promotionMediaSpecSchema = z
	.object({
		sha256: z
			.string()
			.refine((value) => {
				try {
					storageSha256Hex(value);
					return true;
				} catch {
					return false;
				}
			})
			.transform(storageSha256Hex),
		fileSize: z
			.number()
			.int()
			.min(1)
			.max(2 * 1024 * 1024),
		mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
	})
	.strict();
export type PromotionMediaSpec = z.infer<typeof promotionMediaSpecSchema>;
/** Blob identity, not review ID or logical media row ID: prevents duplicate retry across new reviews. */
export function promotionMediaTransferKey(
	source: PromotionIdentity,
	target: PromotionIdentity,
	media: PromotionMediaSpec,
) {
	const from = promotionIdentitySchema.parse(source);
	const to = promotionIdentitySchema.parse(target);
	const file = promotionMediaSpecSchema.parse(media);
	if (
		from.schemaVersion !== to.schemaVersion ||
		from.websiteKey !== to.websiteKey ||
		from.environmentKind !== "staging" ||
		to.environmentKind !== "live" ||
		from.instanceKey === to.instanceKey ||
		from.deploymentOrigin === to.deploymentOrigin
	)
		throw new Error("MEDIA_TARGET_MISMATCH");
	return sha256Hex(
		canonicalJson({
			source: {
				websiteKey: from.websiteKey,
				instanceKey: from.instanceKey,
				deploymentOrigin: from.deploymentOrigin,
			},
			target: {
				websiteKey: to.websiteKey,
				instanceKey: to.instanceKey,
				deploymentOrigin: to.deploymentOrigin,
			},
			sha256: file.sha256,
			fileSize: file.fileSize,
		}),
	);
}
