/**
 * Tools > Events
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { EventsListTable } from "@/components/tools/EventsListTable";

const eventsSearchSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
});

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/events",
)({
  validateSearch: eventsSearchSchema,
  component: EventsPage,
});

function EventsPage() {
  return <EventsListTable />;
}
