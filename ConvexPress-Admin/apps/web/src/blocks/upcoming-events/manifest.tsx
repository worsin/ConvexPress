import { CalendarDays } from "lucide-react";
import type { AdminBlockDefinition } from "@/lib/blocks/types";
import metadata from "./block.json";
import { upcomingEventsAttrsSchema } from "./schema";
import { UpcomingEventsEditor } from "./Editor";
export const definition = { ...metadata, name: "events/upcoming", category: "site", icon: CalendarDays, defaultAttrs: upcomingEventsAttrsSchema.parse({}), schema: upcomingEventsAttrsSchema, Editor: UpcomingEventsEditor, rendererStatus: "ready" } satisfies AdminBlockDefinition<Record<string, unknown>>;
export default definition;
