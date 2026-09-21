import { SlidersHorizontal } from "lucide-react";
import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { fieldGuideAttrsSchema } from "./schema";
import { FieldGuideEditor } from "./Editor";
export const definition = { ...metadata, name: "reference/field-guide", category: "site", icon: SlidersHorizontal, defaultAttrs: fieldGuideAttrsSchema.parse({}), schema: fieldGuideAttrsSchema, Editor: FieldGuideEditor, rendererStatus: "ready" } satisfies AdminBlockDefinition<Record<string, unknown>>;
export default definition;
