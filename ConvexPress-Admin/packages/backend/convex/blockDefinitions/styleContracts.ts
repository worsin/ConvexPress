import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

export const styleArgs = { id: v.id("blockDefinitions"), expectedGeneration: v.number(), version: v.number(), expectedDigest: v.string(), packId: v.string() };
export type StyleArgs = { id: Id<"blockDefinitions">; expectedGeneration: number; version: number; expectedDigest: string; packId: string };
export type StyleProposal = { definitionJson: string; digest: string; fingerprint: string; packId: string };
export const styleProposalValidator = v.object({ definitionJson: v.string(), digest: v.string(), fingerprint: v.string(), packId: v.string() });
