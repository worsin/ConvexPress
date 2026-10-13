import { ConvexError } from "convex/values";

/** The `code` of a ConvexError whose data is `{ code: string, ... }`, else undefined. */
export function convexErrorCode(error: unknown): string | undefined {
  if (!(error instanceof ConvexError)) return undefined;
  const data: unknown = error.data;
  return typeof data === "object" && data !== null && "code" in data && typeof data.code === "string"
    ? data.code
    : undefined;
}

/** The `message` of a ConvexError whose data is `{ message: string, ... }`, else undefined. */
export function convexErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof ConvexError)) return undefined;
  const data: unknown = error.data;
  return typeof data === "object" && data !== null && "message" in data && typeof data.message === "string"
    ? data.message
    : undefined;
}
