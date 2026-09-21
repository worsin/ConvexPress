import { z } from "zod";
export const upcomingEventsAttrsSchema = z.object({
 heading: z.string().max(160).default("Upcoming events"), intro: z.string().max(1000).default(""),
 count: z.number().int().min(1).max(12).default(3), showDescription: z.boolean().default(true),
 emptyText: z.string().max(240).default("New dates are on the way."),
});
export type UpcomingEventsAttrs = z.infer<typeof upcomingEventsAttrsSchema>;
