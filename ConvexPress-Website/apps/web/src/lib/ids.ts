import type { Id } from "@convexpress-website/backend/generated/dataModel";

/**
 * Brand a document id that reaches the website as a plain string: a URL
 * segment, a template-surface callback argument, or a field the backend
 * declares as `v.string()` (storefront cards, block attributes). This is the
 * one place such strings become `Id<TableName>`.
 *
 * It does not validate. The receiving Convex function's `v.id(table)`
 * validator is the authority, and a malformed string fails there.
 */
export function idFromString<TableName extends string>(value: string): Id<TableName> {
  return value as Id<TableName>;
}
