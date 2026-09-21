import { decodeBlockPromotion } from "@backend/canonical-blocks-foundation/blockPromotion";
import type { DefinitionId, SavedDefinition } from "./model";

export type PromotionReview = { id: DefinitionId; version: number; expectedGeneration: number; expectedDigest: string; targetName: string };
export type PromotionOperation = PromotionReview & { expectedPackageDigest: string };
export type PromotionExport = { packageJson: string; packageDigest: string; targetName: string; generation: number; version: number; digest: string };
export type PromotionState = "ready" | "not-installed" | "needs-approval" | "promoted" | "conflict";
export interface PromotionClient {
  exportPackage(args: PromotionReview): Promise<PromotionExport>;
  inspect(args: PromotionOperation): Promise<{ state: PromotionState; generation: number; targetName: string }>;
  confirm(args: PromotionOperation): Promise<{ id: DefinitionId; targetName: string; version: number; digest: string; generation: number; changed: boolean }>;
}
export function checkPromotionExport(value: PromotionExport, saved: SavedDefinition, targetName: string) {
  const decoded = decodeBlockPromotion(value.packageJson);
  if (value.generation !== saved.generation || value.version !== saved.version || value.digest !== saved.digest || value.targetName !== targetName || decoded.bundle.sourceName !== saved.name || decoded.bundle.sourceVersion !== saved.version || decoded.bundle.sourceDigest !== saved.digest || decoded.bundle.targetName !== targetName || decoded.bundle.packageDigest !== value.packageDigest)
    throw Error("The exported package does not match the reviewed definition.");
  return { json: decoded.json, operation: { id: saved.id, version: saved.version, expectedGeneration: saved.generation, expectedDigest: saved.digest, targetName, expectedPackageDigest: value.packageDigest } };
}
export function downloadPromotionPackage(json: string, targetName: string) {
  const blob = new Blob([json + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  try {
    link.href = url;link.download = targetName.replace("/", "-") + ".promotion.json";
    document.body.append(link);link.click();
  } finally { link.remove();setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
