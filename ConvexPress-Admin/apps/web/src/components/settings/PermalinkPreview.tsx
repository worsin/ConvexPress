/**
 * PermalinkPreview - Live preview of the permalink structure.
 *
 * Shows a sample URL with tags replaced by sample data.
 * Updates in real-time as the user selects different structures.
 */

interface PermalinkPreviewProps {
  /** The selected structure type */
  structure: string;
  /** The custom structure pattern (when structure="custom") */
  customStructure?: string;
  /** The site URL for display */
  siteUrl: string;
}

/** Structure patterns for each built-in permalink type */
const STRUCTURE_PATTERNS: Record<string, string> = {
  plain: "/?p=%post_id%",
  day_and_name: "/%year%/%monthnum%/%day%/%postname%/",
  month_and_name: "/%year%/%monthnum%/%postname%/",
  numeric: "/archives/%post_id%",
  post_name: "/%postname%/",
};

/** Sample data for tag replacement */
const SAMPLE_DATA: Record<string, string> = {
  "%year%": "2026",
  "%monthnum%": "02",
  "%day%": "09",
  "%hour%": "14",
  "%minute%": "30",
  "%second%": "45",
  "%post_id%": "123",
  "%postname%": "sample-post",
  "%category%": "uncategorized",
  "%author%": "admin",
};

function replaceTagsWithSample(pattern: string): string {
  let result = pattern;
  for (const [tag, value] of Object.entries(SAMPLE_DATA)) {
    result = result.replaceAll(tag, value);
  }
  return result;
}

export function PermalinkPreview({
  structure,
  customStructure = "/%postname%/",
  siteUrl,
}: PermalinkPreviewProps) {
  const pattern =
    structure === "custom"
      ? customStructure
      : STRUCTURE_PATTERNS[structure] ?? "/%postname%/";

  const preview = replaceTagsWithSample(pattern);
  const fullUrl = `${siteUrl.replace(/\/$/, "")}${preview}`;

  return (
    <div className="mt-2 text-xs font-mono bg-muted/50 px-2.5 py-1.5 text-muted-foreground border border-border rounded-none">
      {fullUrl}
    </div>
  );
}
