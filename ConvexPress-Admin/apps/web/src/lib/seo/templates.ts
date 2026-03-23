/**
 * SEO System - Client-Side Template Variable Resolution
 *
 * Resolves Yoast-compatible template variables like %%title%%, %%sep%%,
 * %%sitename%% for live preview in settings and editor forms.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Resolve template variables in a string.
 *
 * Supported variables:
 *   %%title%%        - Post/page title
 *   %%sitename%%     - Site name
 *   %%sep%%          - Title separator
 *   %%tagline%%      - Site tagline
 *   %%excerpt%%      - Post excerpt
 *   %%date%%         - Published date
 *   %%modified%%     - Modified date
 *   %%name%%         - Author display name
 *   %%term_title%%   - Taxonomy term name
 *   %%searchphrase%% - Search query
 *   %%page%%         - Page number
 *   %%currentyear%%  - Current year
 *   %%currentmonth%% - Current month name
 *
 * Unresolved variables are removed. Multiple spaces are collapsed.
 */
export function resolveTemplate(
  template: string | undefined | null,
  variables: Record<string, string>,
): string {
  if (!template) return "";

  let result = template;

  // Replace all known variables
  for (const [key, value] of Object.entries(variables)) {
    const pattern = `%%${key}%%`;
    result = result.split(pattern).join(value);
  }

  // Remove any remaining unresolved variables
  result = result.replace(/%%[a-z_]+%%/g, "");

  // Collapse multiple spaces
  result = result.replace(/\s+/g, " ").trim();

  return result;
}

/**
 * Build a standard variables map for template resolution.
 */
export function buildTemplateVariables(opts: {
  title?: string;
  siteName?: string;
  separator?: string;
  tagline?: string;
  excerpt?: string;
  date?: string;
  modified?: string;
  authorName?: string;
  termTitle?: string;
  searchPhrase?: string;
  page?: number;
}): Record<string, string> {
  const now = new Date();

  return {
    title: opts.title ?? "",
    sitename: opts.siteName ?? "",
    sep: opts.separator ?? "|",
    tagline: opts.tagline ?? "",
    excerpt: opts.excerpt ?? "",
    date: opts.date ?? "",
    modified: opts.modified ?? "",
    name: opts.authorName ?? "",
    term_title: opts.termTitle ?? "",
    searchphrase: opts.searchPhrase ?? "",
    page: opts.page ? String(opts.page) : "",
    currentyear: String(now.getFullYear()),
    currentmonth: MONTHS[now.getMonth()],
  };
}

/**
 * Generate a live preview of a title template with sample data.
 */
export function previewTemplate(
  template: string,
  opts: {
    siteTitle?: string;
    separator?: string;
    tagline?: string;
    sampleTitle?: string;
  },
): string {
  const variables = buildTemplateVariables({
    title: opts.sampleTitle ?? "Example Post Title",
    siteName: opts.siteTitle ?? "My Site",
    separator: opts.separator ?? "|",
    tagline: opts.tagline ?? "Just another SmithHarper site",
    authorName: "John Doe",
    termTitle: "Technology",
    searchPhrase: "search query",
  });

  return resolveTemplate(template, variables);
}
