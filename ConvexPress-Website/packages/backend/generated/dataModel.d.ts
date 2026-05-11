/**
 * Consumer-only Convex data model placeholder.
 *
 * Website app does not own schema; ConvexPress-Admin owns schema and function deployment.
 * Keep this type intentionally broad for consumer-side type imports.
 */

export type Id<TableName extends string = string> = string & {
  readonly __tableName?: TableName;
};
