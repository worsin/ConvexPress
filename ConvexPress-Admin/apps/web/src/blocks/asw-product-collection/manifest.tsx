import { ShoppingBag } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { AswProductCollectionEditor } from "./Editor";
import { aswProductCollectionAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "asw/product-collection",
  icon: ShoppingBag,
  defaultAttrs: aswProductCollectionAttrsSchema.parse({}),
  schema: aswProductCollectionAttrsSchema,
  Editor: AswProductCollectionEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
