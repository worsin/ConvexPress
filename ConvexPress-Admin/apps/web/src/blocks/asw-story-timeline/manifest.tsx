import { Milestone } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { AswStoryTimelineEditor } from "./Editor";
import { aswStoryTimelineAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "asw/story-timeline",
  icon: Milestone,
  defaultAttrs: aswStoryTimelineAttrsSchema.parse({}),
  schema: aswStoryTimelineAttrsSchema,
  Editor: AswStoryTimelineEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
