import { z } from "zod";

/** Native GET forms pass text, but the router JSON-decodes search values first.
 * Recover the text before validation; the backend still validates each cursor.
 * `.optional()` sits outside the preprocess so the key is optional in the
 * schema's input type too, letting links omit it. */
export function helpSearchText(maxLength: number, minLength = 0) {
  return z.preprocess(
    value => typeof value === "string" ? value : JSON.stringify(value),
    z.string().min(minLength).max(maxLength),
  ).optional();
}
export const helpSearchParams = z.object({
  q: helpSearchText(500), category: helpSearchText(200, 1), cursor: helpSearchText(4096),
});
export const helpCategoryParams = z.object({ cursor: helpSearchText(4096) });
