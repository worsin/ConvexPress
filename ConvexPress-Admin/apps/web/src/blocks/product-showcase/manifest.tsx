import { Store } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { ProductShowcaseEditor } from "./Editor";
import { productShowcaseAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "commerce/product-showcase",
  icon: Store,
  defaultAttrs: productShowcaseAttrsSchema.parse({}),
  schema: productShowcaseAttrsSchema,
  Editor: ProductShowcaseEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
