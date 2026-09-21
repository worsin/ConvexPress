import { v } from "convex/values";
import { aiResourcesValidator, type AiResourceSelection } from "../canonicalDocuments/aiResources";

export const composeArgs = {
  name: v.string(), packId: v.string(),
  expectedScope: v.object({ websiteKey: v.string(), instanceKey: v.string(), deploymentOrigin: v.string() }),
  resources: v.optional(aiResourcesValidator),
};
export type ComposeArgs = { name: string; packId: string; expectedScope: { websiteKey: string; instanceKey: string; deploymentOrigin: string }; resources?: AiResourceSelection };
export type ComposeProposal = { definitionJson: string; digest: string; fingerprint: string };
export const composeProposalValidator = v.object({ definitionJson: v.string(), digest: v.string(), fingerprint: v.string() });
export const definitionReceipt = v.object({ id: v.id("blockDefinitions"), name: v.string(), version: v.number(), generation: v.number(), digest: v.string() });
