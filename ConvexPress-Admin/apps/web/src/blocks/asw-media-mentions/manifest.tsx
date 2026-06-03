import { Newspaper } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { AswMediaMentionsEditor } from "./Editor";
import { aswMediaMentionsAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "asw/media-mentions",
  icon: Newspaper,
  defaultAttrs: aswMediaMentionsAttrsSchema.parse({}),
  schema: aswMediaMentionsAttrsSchema,
  Editor: AswMediaMentionsEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
