import { MapPin } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { ContactStackEditor } from "./Editor";
import { contactStackAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "blocks/contact-stack",
  icon: MapPin,
  defaultAttrs: contactStackAttrsSchema.parse({}),
  schema: contactStackAttrsSchema,
  Editor: ContactStackEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
