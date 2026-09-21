import { z } from "zod";
import { safeLinkSchema } from "./generated/field-runtime.mjs";
export const certificateAvailabilityArgsSchema = z.object({}).strict();
export const certificateAvailabilitySchema = z.object({ available: z.boolean() }).strict();
export const certificateCodeSchema = z.string().trim().toUpperCase().regex(/^CERT-[A-Z0-9-]{6,80}$/);
export const certificateVerificationSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unverified") }).strict(),
  z.object({ state: z.literal("unavailable") }).strict(),
  z.object({ state: z.literal("valid"), serial: certificateCodeSchema,
    holderName: z.string().min(1).max(200), courseTitle: z.string().min(1).max(200),
    certificateTitle: z.string().min(1).max(200), issuedAt: z.number().finite().nonnegative(),
    pdfUrl: safeLinkSchema(z, ["http", "https"]).max(4096).nullable(),
  }).strict(),
]);
export type CertificateVerification = z.infer<typeof certificateVerificationSchema>;
