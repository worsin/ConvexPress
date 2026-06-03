import { Share2 } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { AswSocialShareEditor } from "./Editor";
import { aswSocialShareAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "asw/social-share",
  icon: Share2,
  defaultAttrs: aswSocialShareAttrsSchema.parse({}),
  schema: aswSocialShareAttrsSchema,
  Editor: AswSocialShareEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
