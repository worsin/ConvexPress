import { Image } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { AswPageBannerEditor } from "./Editor";
import { aswPageBannerAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "asw/page-banner",
  icon: Image,
  defaultAttrs: aswPageBannerAttrsSchema.parse({}),
  schema: aswPageBannerAttrsSchema,
  Editor: AswPageBannerEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
