import { Users2 } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { CustomerShowcaseEditor } from "./Editor";
import { customerShowcaseAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "blocks/customer-showcase",
  icon: Users2,
  defaultAttrs: customerShowcaseAttrsSchema.parse({}),
  schema: customerShowcaseAttrsSchema,
  Editor: CustomerShowcaseEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
