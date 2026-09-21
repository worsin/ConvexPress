import { z } from "zod";
import { canonicalDocumentSchema, parseCanonicalDocumentRead, type CanonicalDocumentDto } from "./documentContracts";
import { validateCanonicalTree } from "./generated/instances";
import type { CanonicalTree } from "./generated/types";
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
type LibraryMigrationCandidate = Omit<CanonicalDocumentDto, "document"> & { document: Omit<CanonicalDocumentDto["document"], "blocks" | "composedDefinitions"> & { blocks: CanonicalTree; composedDefinitions?: never } };
export type CanonicalMigrationDto = { contract: "canonical-migration-v1"; source: { postId: string; revision: number; authoringDigest: string }; candidate: LibraryMigrationCandidate };
export const canonicalMigrationSchema = z.strictObject({
  contract: z.literal("canonical-migration-v1"),
  source: z.strictObject({ postId: z.string().min(1).max(256), revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 2), authoringDigest: digest }),
  candidate: canonicalDocumentSchema,
});
export function parseCanonicalMigration(input: unknown): CanonicalMigrationDto {
  const parsed = canonicalMigrationSchema.parse(input);
  const candidate = parseCanonicalDocumentRead(parsed.candidate);
  if (!candidate || candidate.contract !== "canonical-document-v1" || candidate.document.id !== parsed.source.postId || candidate.document.revision !== parsed.source.revision + 1) throw Error("Migration candidate is not bound to its exact source revision");
  if (candidate.document.composedDefinitions) throw Error("Legacy migration cannot introduce custom definitions");
  const { composedDefinitions: _definitions, ...document } = candidate.document;
  return { ...parsed, candidate: { ...candidate, document: { ...document, blocks: validateCanonicalTree(document.blocks) } } };
}
