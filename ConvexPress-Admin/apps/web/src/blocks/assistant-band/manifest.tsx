import { Sparkles } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { AssistantBandEditor } from "./Editor";
import { assistantBandAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "commerce/assistant-band",
  icon: Sparkles,
  defaultAttrs: assistantBandAttrsSchema.parse({}),
  schema: assistantBandAttrsSchema,
  Editor: AssistantBandEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
