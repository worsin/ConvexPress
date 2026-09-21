// Generated; schemas retain their original Zod refinements and defaults.
import type { z } from "zod";
export type LegacyTransform = {kind:"empty-to-null"|"pack-treatment";path:readonly string[]} | {kind:"text-to-richtext";path:readonly string[];mode:"plain-prose"|"markdown-prose"|"plain-inline"|"markdown-inline"};
export type LegacyCompatibility = {name:string;fromVersion:number;toVersion:number;transforms:readonly LegacyTransform[];treatments:readonly {name:string;axes:readonly string[]}[];savedSchema:z.ZodType;renderedSchema:z.ZodType};
export const legacyCompatibility: Readonly<Record<string, LegacyCompatibility>>;
export function legacySanitizeHref(value: string | null | undefined): string | undefined;
export function legacyIsExternalUrl(href: string): boolean;
export function pageSectionsToBlocks(sections: Array<{id:string;type:string;data:Record<string,unknown>}>): unknown[];
