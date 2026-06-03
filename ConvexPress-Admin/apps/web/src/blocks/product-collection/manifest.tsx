import { ShoppingBag } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { ProductCollectionEditor } from "./Editor";
import { productCollectionAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "blocks/product-collection",
  icon: ShoppingBag,
  defaultAttrs: productCollectionAttrsSchema.parse({}),
  schema: productCollectionAttrsSchema,
  Editor: ProductCollectionEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
