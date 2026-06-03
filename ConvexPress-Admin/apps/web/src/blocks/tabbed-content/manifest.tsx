import { PanelsTopLeft } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { TabbedContentEditor } from "./Editor";
import { tabbedContentAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "blocks/tabbed-content",
  icon: PanelsTopLeft,
  defaultAttrs: tabbedContentAttrsSchema.parse({}),
  schema: tabbedContentAttrsSchema,
  Editor: TabbedContentEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
