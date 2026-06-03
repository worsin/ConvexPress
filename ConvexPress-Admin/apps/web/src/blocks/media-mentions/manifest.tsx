import { Newspaper } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { MediaMentionsEditor } from "./Editor";
import { mediaMentionsAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "blocks/media-mentions",
  icon: Newspaper,
  defaultAttrs: mediaMentionsAttrsSchema.parse({}),
  schema: mediaMentionsAttrsSchema,
  Editor: MediaMentionsEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
