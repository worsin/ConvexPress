/** Consumer ID contract. ConvexPress-Admin owns the schema and deployments. */
import type { GenericId } from "convex/values";
export type Id<TableName extends string = string> = GenericId<TableName>;
