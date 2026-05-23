import { AlertTriangle } from "lucide-react";

import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { SampleAlertEditor } from "./Editor";
import { sampleAlertAttrsSchema } from "./schema";

const blockMetadata = metadata as Omit<
  AdminBlockDefinition<Record<string, unknown>>,
  "icon" | "defaultAttrs" | "schema" | "Editor"
>;

export const definition = {
  ...blockMetadata,
  name: "local/sample-alert",
  icon: AlertTriangle,
  defaultAttrs: sampleAlertAttrsSchema.parse({}),
  schema: sampleAlertAttrsSchema,
  Editor: SampleAlertEditor,
} satisfies AdminBlockDefinition<Record<string, unknown>>;

export default definition;
