import { Milestone } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { StoryTimelineEditor } from "./Editor";
import { storyTimelineAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "blocks/story-timeline",
  icon: Milestone,
  defaultAttrs: storyTimelineAttrsSchema.parse({}),
  schema: storyTimelineAttrsSchema,
  Editor: StoryTimelineEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
