import { Image } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { PageBannerEditor } from "./Editor";
import { pageBannerAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "blocks/page-banner",
  icon: Image,
  defaultAttrs: pageBannerAttrsSchema.parse({}),
  schema: pageBannerAttrsSchema,
  Editor: PageBannerEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
