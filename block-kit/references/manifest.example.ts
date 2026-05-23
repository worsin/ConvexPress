import { z } from "zod";

export const exampleAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
});

export type ExampleAttrs = z.infer<typeof exampleAttrsSchema>;

export const exampleBlockManifest = {
  name: "example/simple-section",
  title: "Simple Section",
  version: 1,
  schema: exampleAttrsSchema,
  defaultAttrs: exampleAttrsSchema.parse({
    eyebrow: "",
    heading: "Simple section",
    body: "Write clear copy here.",
  }),
};

