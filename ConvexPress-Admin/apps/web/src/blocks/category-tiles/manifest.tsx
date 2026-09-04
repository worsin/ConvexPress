import { LayoutGrid } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { CategoryTilesEditor } from "./Editor";
import { categoryTilesAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "commerce/category-tiles",
  icon: LayoutGrid,
  defaultAttrs: categoryTilesAttrsSchema.parse({}),
  schema: categoryTilesAttrsSchema,
  Editor: CategoryTilesEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
