import { PanelsTopLeft } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { AswTabbedContentEditor } from "./Editor";
import { aswTabbedContentAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "asw/tabbed-content",
  icon: PanelsTopLeft,
  defaultAttrs: aswTabbedContentAttrsSchema.parse({}),
  schema: aswTabbedContentAttrsSchema,
  Editor: AswTabbedContentEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
