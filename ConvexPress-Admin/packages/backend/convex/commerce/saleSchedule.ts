import { ConvexError } from "convex/values";

/** Validate the merged window so a partial update cannot reverse saved dates.
 * Null removes a bound; omitted bounds are supplied from the saved product. */
export function validateSaleSchedule(window: { salePriceFrom?: number | null; salePriceTo?: number | null }): void {
  const { salePriceFrom: from, salePriceTo: to } = window;
  for (const time of [from, to]) {
    if (time != null && (!Number.isSafeInteger(time) || Math.abs(time) > 8_640_000_000_000_000))
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Sale dates must be valid timestamps." });
  }
  if (from != null && to != null && to < from)
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "Sale end must be on or after its start." });
}
