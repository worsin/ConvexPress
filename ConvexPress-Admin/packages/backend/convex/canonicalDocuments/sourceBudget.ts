import { getDocumentSize, type Value } from "convex/values";
import { CanonicalDataError } from "./foundation/contracts";

/** Server-owned initial limits; never accepted from renderer args. */
export const SOURCE_LIMITS: Readonly<{
	post: number;
	media: number;
 event: number;
 product: number;
 variant: number;
 category: number;
 album: number;
 albumItem: number;
 review: number;
 recipe: number;
	total: number;
}> = Object.freeze<{ post: number; media: number; event: number;
 product: number;
 variant: number;
 category: number;
 album: number;
 albumItem: number;
 review: number;
 recipe: number; total: number }>({
	post: 512 * 1024,
	media: 128 * 1024,
 event: 256 * 1024,
 product: 256 * 1024,
 variant: 128 * 1024,
 category: 128 * 1024,
 album: 128 * 1024,
 albumItem: 16 * 1024,
 review: 128 * 1024,
 recipe: 256 * 1024,
	total: 2 * 1024 * 1024,
});
/** Counts complete fetched documents, including body/metadata omitted from DTOs.
 * The current document has already materialized; this prevents dependent reads
 * after refusal, not that initial read. Settings/policy/user reads are not counted.
 */
export class SourceByteLedger {
	usedBytes = 0;
	beforeRead(): void {
		if (this.usedBytes >= SOURCE_LIMITS.total)
			throw new CanonicalDataError(
				"SOURCE_TOTAL_BUDGET",
				"sources",
				"Source budget exhausted before the next read",
			);
	}
	record(kind: "post" | "media" | "event" | "product" | "variant" | "category" | "recipe" | "album" | "albumItem" | "review", document: Record<string, Value>): void {
		const bytes = getDocumentSize(document);
		this.usedBytes += bytes;
		if (bytes > SOURCE_LIMITS[kind])
			throw new CanonicalDataError(
				"SOURCE_DOCUMENT_BUDGET",
				kind,
				`Fetched ${kind} exceeds the source document budget`,
			);
		if (this.usedBytes > SOURCE_LIMITS.total)
			throw new CanonicalDataError(
				"SOURCE_TOTAL_BUDGET",
				"sources",
				"Fetched source documents exceed the page source budget",
			);
	}
}
