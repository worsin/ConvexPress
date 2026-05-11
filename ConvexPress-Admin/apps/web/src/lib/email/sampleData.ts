/**
 * Generic preview data for email template rendering in the admin UI.
 *
 * The backend owns the canonical template variables. The frontend preview only
 * needs stable, realistic placeholders so every template can render even when
 * the UI has not hard-coded a slug-specific sample map.
 */

const NOW = new Date("2026-04-30T18:30:00.000Z");

export const GLOBAL_SAMPLE_VARIABLES: Record<string, string> = {
  site_name: "ConvexPress",
  site_url: "https://example.com",
  current_year: "2026",
  logo_url: "https://example.com/logo.png",
  footer_text: "ConvexPress transactional email preview",
  unsubscribe_url: "https://example.com/account/email-preferences",
  recipient_name: "Alex Example",
};

const OVERRIDES: Record<string, string> = {
  agent_name: "Morgan Agent",
  article_title: "Publishing Knowledge Base Updates",
  article_url: "https://example.com/help/getting-started/publishing-updates",
  attempt_count: "5",
  author_name: "Jane Author",
  category: "Billing",
  changed_at: NOW.toLocaleString("en-US"),
  changed_by: "Morgan Admin",
  comment_author: "Taylor Reader",
  comment_count: "12",
  comment_excerpt:
    "Thanks for the detailed walkthrough. This solved the issue for me.",
  comment_summary:
    "12 comments were posted across 3 pieces of content this week, including 4 replies awaiting your review.",
  comment_url: "https://example.com/blog/getting-started#comment-42",
  current_usage: "8.4 GB",
  data_retention_days: "30",
  deletion_date: NOW.toLocaleDateString("en-US"),
  device: "Chrome on macOS",
  device_info: "Chrome on macOS",
  digest_period: "This week",
  digest_url: "https://example.com/admin/comments",
  edit_url: "https://example.com/admin/posts/123/edit",
  endpoint: "https://hooks.example.com/content-sync",
  error: "Connection timeout after 30 seconds",
  error_message: "Connection timeout after 30 seconds",
  expiry_hours: "24",
  expires_in: "24 hours",
  invite_url: "https://example.com/register?token=invite_123",
  inviter_name: "Morgan Admin",
  ip_address: "203.0.113.42",
  location: "Denver, CO",
  login_time: NOW.toLocaleString("en-US"),
  manage_url: "https://example.com/admin/media",
  max_storage: "10 GB",
  moderation_url: "https://example.com/admin/comments?status=pending",
  new_role: "Author",
  old_role: "Contributor",
  page_count: "47",
  percent_used: "84%",
  post_count: "5",
  post_excerpt:
    "Learn how to configure ConvexPress email, membership, and subscription workflows without custom glue code.",
  post_list:
    "<li><a href=\"https://example.com/blog/getting-started\">Getting Started with ConvexPress</a></li>",
  post_title: "Getting Started with ConvexPress",
  post_url: "https://example.com/blog/getting-started",
  previous_role: "Contributor",
  priority: "High",
  published_at: NOW.toLocaleString("en-US"),
  rating_url: "https://example.com/support/tickets/ticket_1?rate=1",
  reason: "The article needs one more revision before publication.",
  recipient_email: "alex@example.com",
  rejection_reason: "Please clarify the installation steps in section two.",
  replier_name: "Jane Author",
  reply_excerpt: "We reviewed your report and confirmed the fix is deployed.",
  reset_url:
    "https://example.com/reset-password?token=reset_123&email=alex%40example.com",
  review_url: "https://example.com/admin/kb/articles/article_1",
  reviewer_name: "Riley Reviewer",
  revision_date: NOW.toLocaleString("en-US"),
  role: "Author",
  scheduled_date: NOW.toLocaleString("en-US"),
  section: "General",
  security_url: "https://example.com/account/security",
  settings_url: "https://example.com/admin/settings/general",
  sitemap_url: "https://example.com/sitemap.xml",
  status_code: "504",
  step_name: "Editorial Review",
  subject: "Unable to access premium library",
  support_email: "support@example.com",
  target_email: "alex@example.com",
  ticket_id: "TKT-202604-00042",
  ticket_url: "https://example.com/support/tickets/ticket_1",
  title: "Getting Started with ConvexPress",
  total_space: "10 GB",
  used_space: "8.4 GB",
  url_count: "47",
  usage_percent: "84",
  user_email: "alex@example.com",
  user_name: "Alex Example",
  verification_url: "https://example.com/verify-email",
  week_end: NOW.toLocaleDateString("en-US"),
  week_start: new Date("2026-04-23T18:30:00.000Z").toLocaleDateString(
    "en-US",
  ),
};

function titleCase(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferSampleValue(variableName: string) {
  if (OVERRIDES[variableName]) {
    return OVERRIDES[variableName];
  }

  if (variableName.endsWith("_url")) {
    const slug = variableName.replace(/_url$/, "").replace(/_/g, "-");
    return `https://example.com/${slug}`;
  }

  if (
    variableName.endsWith("_at") ||
    variableName.endsWith("_date") ||
    variableName.endsWith("_time")
  ) {
    return NOW.toLocaleString("en-US");
  }

  if (variableName.includes("email")) {
    return "alex@example.com";
  }

  if (variableName.includes("name")) {
    return "Alex Example";
  }

  if (
    variableName.includes("count") ||
    variableName.includes("days") ||
    variableName.includes("hours") ||
    variableName.includes("attempt") ||
    variableName.includes("quantity")
  ) {
    return "3";
  }

  if (
    variableName.includes("amount") ||
    variableName.includes("price") ||
    variableName.includes("total") ||
    variableName.includes("usage") ||
    variableName.includes("percent")
  ) {
    return "$49.00";
  }

  if (variableName.includes("title") || variableName.includes("subject")) {
    return "Sample Content Update";
  }

  if (variableName.includes("excerpt") || variableName.includes("summary")) {
    return "This is a sample excerpt used to preview the email notification.";
  }

  return titleCase(variableName);
}

export function getSampleVariables(
  _templateSlug: string,
  bodyHtml?: string,
  subjectTemplate?: string,
): Record<string, string> {
  const variables: Record<string, string> = {
    ...GLOBAL_SAMPLE_VARIABLES,
  };
  const source = `${bodyHtml ?? ""}\n${subjectTemplate ?? ""}`;
  const matches = source.match(/\{(\w+)\}/g) ?? [];

  for (const match of matches) {
    const variableName = match.slice(1, -1);
    variables[variableName] ??= inferSampleValue(variableName);
  }

  return variables;
}
