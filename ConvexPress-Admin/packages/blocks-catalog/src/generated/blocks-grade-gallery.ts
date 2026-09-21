import { z } from "zod";

const gradeImageSchema = z.object({
  mediaId: z.string().default(""),
  alt: z.string().max(200).default(""),
  caption: z.string().max(220).default(""),
});

export const gradeGalleryAttrsSchema = z.object({
  heading: z.string().max(140).default("Product grades"),
  intro: z.string().max(800).default(""),
  sections: z.array(z.object({
    grade: z.string().max(80).default("Grade"),
    description: z.string().max(1600).default(""),
    notes: z.string().max(800).default(""),
    images: z.array(gradeImageSchema).max(16).default([]),
  })).max(12).default([]),
});

export type GradeGalleryAttrs = z.infer<typeof gradeGalleryAttrsSchema>;
export type GradeGalleryImage = z.infer<typeof gradeImageSchema>;
