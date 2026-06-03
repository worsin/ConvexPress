import { Share2 } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { SocialShareEditor } from "./Editor";
import { socialShareAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "blocks/social-share",
  icon: Share2,
  defaultAttrs: socialShareAttrsSchema.parse({}),
  schema: socialShareAttrsSchema,
  Editor: SocialShareEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
