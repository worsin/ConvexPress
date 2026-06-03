import { Images } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { AswGradeGalleryEditor } from "./Editor";
import { aswGradeGalleryAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "asw/grade-gallery",
  icon: Images,
  defaultAttrs: aswGradeGalleryAttrsSchema.parse({}),
  schema: aswGradeGalleryAttrsSchema,
  Editor: AswGradeGalleryEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
