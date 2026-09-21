import { z } from "zod";
import type { CanonicalDraft } from "./document-adapter";
import { checkedDraft, draftDigest, readForEditor } from "./document-adapter";
import type { DocumentKey } from "./session";
import type { CanonicalDocumentDto } from "@backend/canonical-blocks-foundation/documentContracts";

export interface AiResourceSelection { products: string[]; media: string[] }
export interface AiProposalRequest { resources?: AiResourceSelection; expectedRevision: number; expectedFingerprint: string; title: string; blocks: CanonicalDraft["blocks"] }
export interface AiProposalClient {
  generateAi(args: { resources?: AiResourceSelection; expectedRevision: number; prompt: string }): Promise<unknown>;
  previewAi(args: AiProposalRequest & { request?: Record<string, string> }): Promise<unknown>;
  applyAi(args: AiProposalRequest): Promise<unknown>;
}
const proposalEnvelope = z.strictObject({ title: z.string().min(1).max(512), blocks: z.array(z.unknown()).min(1).max(80), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) });
/** The first preview is what loads authoritative custom schemas and resources.
 * Never trust a model/client-provided definition snapshot for the editor. */
export function proposalRequest(raw: unknown, expectedRevision: number, resources?: AiResourceSelection): AiProposalRequest {
  const value = proposalEnvelope.parse(raw);
  return { ...(resources ? { resources } : {}), expectedRevision, expectedFingerprint: value.fingerprint, title: value.title, blocks: value.blocks as CanonicalDraft["blocks"] };
}
export function checkedProposalPreview(raw: unknown, key: DocumentKey, request: AiProposalRequest): CanonicalDocumentDto {
  const value = readForEditor(raw, key);
  if (!value || value.contract !== "canonical-document-v1" || ![request.expectedRevision, request.expectedRevision + 1].includes(value.document.revision)) throw Error("Proposal preview revision mismatch");
  const draft = checkedDraft({ title: request.title, blocks: request.blocks, ...(value.document.composedDefinitions ? { composedDefinitions: value.document.composedDefinitions } : {}) });
  if (draftDigest(draft) !== value.document.digest) throw Error("Proposal preview content mismatch");
  return value;
}
export function proposalIssue(error: unknown): string {
  const code = error && typeof error === "object" && "data" in error && error.data && typeof error.data === "object" && "code" in error.data ? error.data.code : null;
  if (code === "CONFIGURATION_ERROR") return "Set up your AI provider in Settings before generating a proposal.";
  if (code === "AI_RESOURCE_UNAVAILABLE") return "A selected resource is no longer available. Choose current website resources and try again.";
  if (code === "AI_PROVIDER_TIMEOUT") return "Generation timed out. Your saved document has not changed.";
  if (["FORBIDDEN", "UNAUTHORIZED", "AI_SCOPE_CHANGED", "AI_CONTEXT_CHANGED", "AI_DOCUMENT_CHANGED"].includes(String(code))) return "Your document or access changed. Close this review and reopen the current document.";
  return "The proposal could not be completed. Your saved document has not changed.";
}
