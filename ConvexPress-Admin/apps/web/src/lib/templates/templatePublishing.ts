import type { Values } from "./draftModel";

export interface TemplateSection { active: string; overrides: Record<string, string>; variants: Record<string, string>; settings: Record<string, Values> }
export interface TemplateSnapshot { values: TemplateSection; revision: string; identity: { websiteKey: string; instanceKey: string; environmentKind: string } | null }
