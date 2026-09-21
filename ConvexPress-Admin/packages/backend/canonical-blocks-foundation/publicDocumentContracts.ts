/** Public display is a distinct contract. No source-authoring digest, preview
 * authority, session or editorial lock metadata belongs in this transport. */
import { z } from "zod";
import { canonicalDocumentSchema, parseCanonicalDocumentRead, type CanonicalDocumentDto } from "./documentContracts";
import { encodedBytes, CanonicalDataError } from "./contracts";
import { DOCUMENT_LIMITS } from "./documentContracts";
import { assertPublicCanonicalTree } from "./publicTree";
/** Server-evaluated authorization freshness, never a reusable access token. */
export const PUBLIC_ACCESS_LEASE_MS = 60_000;
export const publicAccessLeaseSchema = z.strictObject({ evaluatedAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative() });
export type PublicAccessLease = z.infer<typeof publicAccessLeaseSchema>;
export type PublicCanonicalReady = Omit<CanonicalDocumentDto, "contract" | "document" | "displayBlocks" | "displayLease"> & { contract: "canonical-public-document-v1"; state: "ready"; viewerSubject: string | null; accessLease: PublicAccessLease | null; historyDigest?: string; document: Omit<CanonicalDocumentDto["document"], "status" | "scheduledAt"> };
export type PublicCanonicalRestricted = { contract: "canonical-public-document-v1"; state: "restricted"; viewerSubject: string | null; accessLease: PublicAccessLease | null; historyDigest?: string; document: { id: string; type: "post" | "page"; title: string; path: string | null; excerpt: string | null }; restriction: { password: boolean; membership: boolean } };
export type PublicCanonicalDocument = PublicCanonicalReady | PublicCanonicalRestricted | null;
export const publicReadySchema = canonicalDocumentSchema.omit({ contract: true, document: true, displayBlocks: true, displayLease: true }).extend({
  contract: z.literal("canonical-public-document-v1"), state: z.literal("ready"), viewerSubject: z.string().min(1).max(256).nullable(), accessLease: publicAccessLeaseSchema.nullable(), historyDigest: z.string().regex(/^[a-f0-9]{64}$/u).optional(), document: canonicalDocumentSchema.shape.document.omit({ status: true, scheduledAt: true }),
}) satisfies z.ZodType<PublicCanonicalReady>;
export const publicRestrictedSchema: z.ZodType<PublicCanonicalRestricted> = z.strictObject({
  contract: z.literal("canonical-public-document-v1"), state: z.literal("restricted"), viewerSubject: z.string().min(1).max(256).nullable(), accessLease: publicAccessLeaseSchema.nullable(), historyDigest: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  document: z.strictObject({ id: z.string().min(1).max(256), type: z.enum(["post", "page"]), title: z.string().max(DOCUMENT_LIMITS.title), path: z.string().max(2048).regex(/^\/(?!\/)[^\s\\]*$/u).nullable(), excerpt: z.string().max(4000).nullable() }),
  restriction: z.strictObject({ password: z.boolean(), membership: z.boolean() }),
});
export function parsePublicCanonicalDocument(input: unknown): PublicCanonicalDocument {
  if (input === null) return null;
  if (encodedBytes(input) > DOCUMENT_LIMITS.transportBytes) throw new CanonicalDataError("DOCUMENT_TRANSPORT_BUDGET", "document", "Public display is too large");
  if (input && typeof input === "object" && "state" in input && input.state === "restricted") {
    const value = publicRestrictedSchema.parse(input);
    if (!value.restriction.password && !value.restriction.membership) throw new Error("A restricted result requires an actual restriction");
    validateLease(value);
    return value;
  }
  const value = publicReadySchema.parse(input);
  validateLease(value);
  const { state: _state, contract: _contract, viewerSubject: _viewerSubject, accessLease: _accessLease, historyDigest: _historyDigest, ...display } = value;
  // Reuse the complete tree/data/resource trust gate. The injected literal is
  // solely this validator's private schema tag; no editorial authority is read.
  const checked = parseCanonicalDocumentRead({ ...display, contract: "canonical-document-v1", document: { ...display.document, status: "draft" } });
  if (!checked || checked.contract !== "canonical-document-v1") throw new Error("Invalid public display");
  assertPublicCanonicalTree(checked.document.blocks);
  return value;
}

function validateLease(value: Exclude<PublicCanonicalDocument, null>): void {
  if (value.viewerSubject !== null && value.accessLease === null) throw new Error("Authenticated display requires an access lease");
  const lease = value.accessLease;
  if (lease && (lease.expiresAt <= lease.evaluatedAt || lease.expiresAt - lease.evaluatedAt > PUBLIC_ACCESS_LEASE_MS))
    throw new Error("Invalid public access lease duration");
}
