import { z } from "zod";
/** The CTA only advertises the existing route. Submission stays in its authenticated flow. */
export const ticketCtaArgsSchema = z.strictObject({});
export const ticketCtaResultSchema = z.strictObject({ available: z.boolean() });
export type TicketCtaResult = z.infer<typeof ticketCtaResultSchema>;
