import { z } from "zod";
import { canonicalDocumentSchema, parseCanonicalDocumentRead, type CanonicalDocumentDto } from "./documentContracts";
import { validateCanonicalTree } from "./generated/instances";
import type { CanonicalTree } from "./generated/types";
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
/** Settings saved by the old editor but unused by its renderer/edit controls.
 * A review keeps them in the original revision, never silently activates them. */
export const inactiveLegacySettingsSchema = z.strictObject({
  blockId: z.string().min(1).max(256), name: z.string().min(1).max(256),
  layout: z.strictObject({
    tone: z.enum(["default", "muted", "accent", "contrast"]).optional(),
    padding: z.enum(["compact", "normal", "spacious"]).optional(),
    container: z.enum(["content", "wide", "full"]).optional(),
    align: z.enum(["default", "wide", "full"]).optional(),
  }).optional(),
  lock: z.strictObject({move:z.boolean().optional(),remove:z.boolean().optional(),edit:z.boolean().optional()}).optional(),
});
export type InactiveLegacySettings = z.infer<typeof inactiveLegacySettingsSchema>;
type LibraryMigrationCandidate = Omit<CanonicalDocumentDto, "document"> & { document: Omit<CanonicalDocumentDto["document"], "blocks" | "composedDefinitions"> & { blocks: CanonicalTree; composedDefinitions?: never } };
export type CanonicalMigrationDto = { contract: "canonical-migration-v1"; source: { postId: string; revision: number; authoringDigest: string }; candidate: LibraryMigrationCandidate; inactiveSettings?: InactiveLegacySettings[]; importedContent?: "plain-text" };
export const canonicalMigrationSchema = z.strictObject({
  contract: z.literal("canonical-migration-v1"),
  source: z.strictObject({ postId: z.string().min(1).max(256), revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 2), authoringDigest: digest }),
  candidate: canonicalDocumentSchema,
  inactiveSettings: z.array(inactiveLegacySettingsSchema).max(80).optional(),
  importedContent: z.literal("plain-text").optional(),
});
export function parseCanonicalMigration(input: unknown): CanonicalMigrationDto {
  const parsed = canonicalMigrationSchema.parse(input);
  const candidate = parseCanonicalDocumentRead(parsed.candidate);
  if (!candidate || candidate.contract !== "canonical-document-v1" || candidate.document.id !== parsed.source.postId || candidate.document.revision !== parsed.source.revision + 1) throw Error("Migration candidate is not bound to its exact source revision");
  if (candidate.document.composedDefinitions) throw Error("Legacy migration cannot introduce custom definitions");
  const { composedDefinitions: _definitions, ...document } = candidate.document;
  return { ...parsed, candidate: { ...candidate, document: { ...document, blocks: validateCanonicalTree(document.blocks) } } };
}
