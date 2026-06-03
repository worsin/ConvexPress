import { Leaf } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { AswEarthtonePromoEditor } from "./Editor";
import { aswEarthtonePromoAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "asw/earthtone-promo",
  icon: Leaf,
  defaultAttrs: aswEarthtonePromoAttrsSchema.parse({}),
  schema: aswEarthtonePromoAttrsSchema,
  Editor: AswEarthtonePromoEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
