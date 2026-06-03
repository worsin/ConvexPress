import { Leaf } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { PromoBandEditor } from "./Editor";
import { promoBandAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "blocks/promo-band",
  icon: Leaf,
  defaultAttrs: promoBandAttrsSchema.parse({}),
  schema: promoBandAttrsSchema,
  Editor: PromoBandEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
