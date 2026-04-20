export interface AlbumShortcodeAttrs {
  id?: string;
  slug?: string;
  layout?: "grid" | "masonry";
  columns?: number;
  limit?: number;
  showTitle?: boolean;
  showDescription?: boolean;
}

function parseBoolean(value: string | undefined) {
  if (!value) return undefined;
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return undefined;
}

export function parseAlbumShortcode(input: string): AlbumShortcodeAttrs | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^\[album\s+(.+)\]$/i);
  if (!match) return null;

  const attrs: Record<string, string> = {};
  const attrPattern = /(\w+)="([^"]*)"/g;
  let attrMatch: RegExpExecArray | null = null;

  while ((attrMatch = attrPattern.exec(match[1])) !== null) {
    attrs[attrMatch[1]] = attrMatch[2];
  }

  if (!attrs.id && !attrs.slug) {
    return null;
  }

  const columns = attrs.columns ? Number(attrs.columns) : undefined;
  const limit = attrs.limit ? Number(attrs.limit) : undefined;

  return {
    id: attrs.id,
    slug: attrs.slug,
    layout:
      attrs.layout === "masonry" || attrs.layout === "grid"
        ? attrs.layout
        : undefined,
    columns: Number.isFinite(columns) ? columns : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
    showTitle: parseBoolean(attrs.show_title),
    showDescription: parseBoolean(attrs.show_description),
  };
}
