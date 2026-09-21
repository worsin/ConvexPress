export type SourceEntry = { name: string; version: number };
export type RendererEntry = SourceEntry & { source: string; sha256: string };
export function discoverSourceInventory(
	root: string,
): Promise<{ specs: SourceEntry[]; renderers: RendererEntry[] }>;
export function compareRendererInventory(
	expected: SourceEntry[],
	actual: string[],
): { missing: string[]; unexpected: string[]; duplicates: string[] };
