import { Images } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { GradeGalleryEditor } from "./Editor";
import { gradeGalleryAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "blocks/grade-gallery",
  icon: Images,
  defaultAttrs: gradeGalleryAttrsSchema.parse({}),
  schema: gradeGalleryAttrsSchema,
  Editor: GradeGalleryEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
