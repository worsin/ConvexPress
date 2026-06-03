import { MapPin } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { AswContactStackEditor } from "./Editor";
import { aswContactStackAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "asw/contact-stack",
  icon: MapPin,
  defaultAttrs: aswContactStackAttrsSchema.parse({}),
  schema: aswContactStackAttrsSchema,
  Editor: AswContactStackEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
