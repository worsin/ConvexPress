import { Users2 } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { AswCustomerShowcaseEditor } from "./Editor";
import { aswCustomerShowcaseAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "asw/customer-showcase",
  icon: Users2,
  defaultAttrs: aswCustomerShowcaseAttrsSchema.parse({}),
  schema: aswCustomerShowcaseAttrsSchema,
  Editor: AswCustomerShowcaseEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
