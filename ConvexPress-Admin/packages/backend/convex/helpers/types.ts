/**
 * Type Utilities
 *
 * Helper functions for type-safe casting, replacing `as any` patterns.
 */

import type { Id, TableNames } from "../_generated/dataModel";

/**
 * Type-safe cast for Convex ID strings.
 * Use this instead of `as any` when passing string IDs to Convex mutations/queries.
 *
 * @example
 * // Instead of: commentId as any
 * asId<"comments">(commentId)
 */
export function asId<T extends TableNames>(id: string): Id<T> {
  return id as Id<T>;
}

/**
 * Type-safe cast for optional Convex ID strings.
 * Returns undefined if the input is falsy.
 *
 * @example
 * // Instead of: (parentId as any) || undefined
 * asOptionalId<"comments">(parentId)
 */
export function asOptionalId<T extends TableNames>(
  id: string | null | undefined
): Id<T> | undefined {
  return id ? (id as Id<T>) : undefined;
}
