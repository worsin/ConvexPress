/**
 * Block catalog — the AI contract for the block editor.
 *
 * Single source of truth for the LLM's view of every block: name, when-to-use,
 * when-to-avoid, the JSON shape (fields + max lengths), and an example. The
 * Convex backend (packages/backend/convex/blocks/aiPromptBuilder.ts) re-exports
 * from this module so prompt building has no duplicated catalog data.
 *
 * The frontend registry (apps/web/src/lib/blocks/registry.tsx) carries the
 * editor-specific concerns (icons, Zod schemas, default attrs, React Editor
 * components) and the script `scripts/check-block-catalog.mjs` enforces that
 * the registry's block names match the entries in this catalog. When you add
 * a new block, update BOTH:
 *
 *   1. This catalog with the AI-facing metadata.
 *   2. The frontend registry with the Editor + Zod schema + icon.
 *
 * Keeping them aligned is enforced by `bun run check:blocks` in CI.
 *
 * This module has no runtime dependencies — it is safe to import from any
 * environment (Convex actions, Node scripts, the browser bundle, etc.).
 */

export type BlockCatalogEntry = {
  name: string;
  title: string;
  description: string;
  category: string;
  useFor?: string;
  avoid?: string;
  /** Field names + a short hint per field. */
  fields: Array<{ name: string; type: string; hint?: string; max?: number }>;
  example: Record<string, unknown>;
};

export const BLOCK_CATALOG: BlockCatalogEntry[] = [
  // ── Wave A — content blocks ───────────────────────────────────────────────
  {
    name: "core/paragraph",
    title: "Paragraph",
    description: "A plain text paragraph. Supports inline markdown emphasis.",
    category: "text",
    useFor: "regular prose paragraphs, transitional copy, blog post body text",
    avoid: "headings (use core/heading) or lists (use core/list)",
    fields: [
      { name: "body", type: "string", hint: "Plain text. Supports **bold**, *italic*, [link](url).", max: 2000 },
    ],
    example: { body: "This is a paragraph with **emphasis** and a [link](https://example.com)." },
  },
  {
    name: "core/heading",
    title: "Heading",
    description: "A section heading (H1 through H6).",
    category: "text",
    useFor: "section headings inside an article or page",
    avoid: "the page title itself (it lives outside the block list)",
    fields: [
      { name: "level", type: "1|2|3|4|5|6", hint: "Heading level" },
      { name: "text", type: "string", hint: "Heading text", max: 200 },
      { name: "anchor", type: "string", hint: "Optional URL anchor slug", max: 80 },
    ],
    example: { level: 2, text: "How it works", anchor: "how-it-works" },
  },
  {
    name: "core/list",
    title: "List",
    description: "Bulleted, numbered, or task list.",
    category: "text",
    useFor: "any list of items — features, steps, checklist, points",
    avoid: "feature grids with descriptions (use core/feature-grid)",
    fields: [
      { name: "style", type: '"bullet"|"ordered"|"task"', hint: "List style" },
      { name: "items", type: "Array<{text: string, done?: boolean}>", hint: "List items" },
    ],
    example: { style: "bullet", items: [{ text: "First item" }, { text: "Second item" }] },
  },
  {
    name: "core/image",
    title: "Image",
    description: "A standalone image with optional caption and link.",
    category: "media",
    useFor: "inline images in blog content or page bodies",
    avoid: "hero media (use core/hero) or side-by-side media (use core/media-text)",
    fields: [
      { name: "mediaId", type: "string", hint: "Convex media _id. Leave empty if no image yet." },
      { name: "alt", type: "string", hint: "Alt text", max: 200 },
      { name: "caption", type: "string", hint: "Optional caption", max: 300 },
      { name: "href", type: "string", hint: "Optional link URL" },
    ],
    example: { mediaId: "", alt: "Diagram of the architecture", caption: "Figure 1 — system overview", href: "" },
  },
  {
    name: "core/quote",
    title: "Quote",
    description: "A pull quote or blockquote with optional attribution.",
    category: "text",
    useFor: "memorable lines, source citations",
    avoid: "multiple testimonials together (use core/testimonials)",
    fields: [
      { name: "text", type: "string", hint: "The quote", max: 800 },
      { name: "cite", type: "string", hint: "Optional attribution", max: 120 },
      { name: "source", type: "string", hint: "Optional source URL" },
    ],
    example: { text: "The best way to predict the future is to invent it.", cite: "Alan Kay", source: "" },
  },
  {
    name: "core/code",
    title: "Code",
    description: "A fenced code block with syntax highlighting.",
    category: "text",
    useFor: "code snippets, terminal output, config examples",
    avoid: "inline code within a paragraph",
    fields: [
      { name: "language", type: "string", hint: "Language identifier (typescript, python, etc.)", max: 40 },
      { name: "code", type: "string", hint: "The code content" },
      { name: "filename", type: "string", hint: "Optional filename to display", max: 120 },
    ],
    example: { language: "typescript", code: "export function hello() {\n  return 'world';\n}", filename: "hello.ts" },
  },
  {
    name: "core/divider",
    title: "Divider",
    description: "A horizontal separator between sections.",
    category: "layout",
    fields: [{ name: "variant", type: '"default"|"section"|"subtle"', hint: "Variant" }],
    example: { variant: "default" },
  },
  {
    name: "core/spacer",
    title: "Spacer",
    description: "Semantic vertical spacing — the skill decides actual height.",
    category: "layout",
    fields: [{ name: "size", type: '"small"|"medium"|"large"|"xlarge"', hint: "Size" }],
    example: { size: "medium" },
  },
  {
    name: "core/embed",
    title: "Embed",
    description: "Embed a YouTube, Vimeo, or other rich-media URL.",
    category: "media",
    fields: [
      { name: "url", type: "string", hint: "URL to embed" },
      { name: "caption", type: "string", hint: "Optional caption" },
    ],
    example: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", caption: "" },
  },

  // ── Marketing blocks ──────────────────────────────────────────────────────
  {
    name: "core/hero",
    title: "Hero",
    description: "Opening section with title, body, CTAs, and optional media.",
    category: "marketing",
    useFor: "the first block on landing pages, product pages, marketing pages",
    avoid: "blog posts (use core/heading + core/paragraph)",
    fields: [
      { name: "eyebrow", type: "string", max: 80 },
      { name: "title", type: "string", max: 120, hint: "Required" },
      { name: "body", type: "string", max: 600 },
      { name: "primaryCtaLabel", type: "string", max: 40 },
      { name: "primaryCtaUrl", type: "string", hint: "URL or empty" },
      { name: "secondaryCtaLabel", type: "string", max: 40 },
      { name: "secondaryCtaUrl", type: "string", hint: "URL or empty" },
      { name: "mediaId", type: "string", hint: "Empty if no media" },
    ],
    example: {
      eyebrow: "New release",
      title: "Ship faster with ConvexPress",
      body: "An AI-first CMS that builds beautiful pages from a prompt and lets you polish in seconds.",
      primaryCtaLabel: "Get started",
      primaryCtaUrl: "/signup",
      secondaryCtaLabel: "Read the docs",
      secondaryCtaUrl: "/docs",
      mediaId: "",
    },
  },
  {
    name: "core/rich-text",
    title: "Rich Text Section",
    description: "A copy-only section with eyebrow, heading, and body.",
    category: "text",
    useFor: "long-form copy sections with an eyebrow/heading/body structure",
    fields: [
      { name: "eyebrow", type: "string", max: 80 },
      { name: "heading", type: "string", max: 120 },
      { name: "body", type: "string", max: 2000 },
    ],
    example: { eyebrow: "Why ConvexPress", heading: "Built for AI-first content", body: "..." },
  },
  {
    name: "core/feature-grid",
    title: "Feature Grid",
    description: "Grid of feature cards with a section intro.",
    category: "marketing",
    useFor: "3–6 features or benefits with short descriptions",
    avoid: "more than 8 items (consider splitting)",
    fields: [
      { name: "eyebrow", type: "string", max: 80 },
      { name: "heading", type: "string", max: 120 },
      { name: "body", type: "string", max: 400 },
      { name: "items", type: "Array<{title: string, description: string}>", hint: "Feature cards (max 12)" },
    ],
    example: {
      eyebrow: "Highlights",
      heading: "What makes it useful",
      body: "Three reasons people choose ConvexPress.",
      items: [
        { title: "AI-first", description: "Type a prompt, get a page." },
        { title: "Skill-driven", description: "Themes own the look." },
        { title: "Real-time", description: "Powered by Convex." },
      ],
    },
  },
  {
    name: "core/cta-band",
    title: "CTA Band",
    description: "A focused call-to-action section.",
    category: "marketing",
    useFor: "the closing section of a landing page",
    fields: [
      { name: "eyebrow", type: "string", max: 80 },
      { name: "heading", type: "string", max: 120, hint: "Required" },
      { name: "body", type: "string", max: 400 },
      { name: "primaryCtaLabel", type: "string", max: 40 },
      { name: "primaryCtaUrl", type: "string" },
      { name: "secondaryCtaLabel", type: "string", max: 40 },
      { name: "secondaryCtaUrl", type: "string" },
    ],
    example: {
      eyebrow: "Next step",
      heading: "Ready to ship?",
      body: "Try ConvexPress free for 14 days.",
      primaryCtaLabel: "Start free trial",
      primaryCtaUrl: "/signup",
      secondaryCtaLabel: "",
      secondaryCtaUrl: "",
    },
  },
  {
    name: "core/media-text",
    title: "Media + Text",
    description: "Split section: copy on one side, media on the other.",
    category: "media",
    useFor: "alternating image-text storytelling sections",
    fields: [
      { name: "eyebrow", type: "string", max: 80 },
      { name: "heading", type: "string", max: 120 },
      { name: "body", type: "string", max: 600 },
      { name: "mediaId", type: "string" },
      { name: "mediaAlt", type: "string", max: 200 },
      { name: "mediaPosition", type: '"left"|"right"' },
      { name: "ctaLabel", type: "string", max: 40 },
      { name: "ctaUrl", type: "string" },
    ],
    example: {
      eyebrow: "How it works",
      heading: "Prompt, polish, publish",
      body: "Drop a prompt, watch your page generate, then drag blocks around to polish.",
      mediaId: "",
      mediaAlt: "",
      mediaPosition: "right",
      ctaLabel: "See a demo",
      ctaUrl: "/demo",
    },
  },
  {
    name: "core/testimonials",
    title: "Testimonials",
    description: "Customer quotes with attribution.",
    category: "marketing",
    useFor: "social proof sections",
    avoid: "a single quote (use core/quote)",
    fields: [
      { name: "eyebrow", type: "string", max: 80 },
      { name: "heading", type: "string", max: 120 },
      { name: "body", type: "string", max: 400 },
      { name: "items", type: "Array<{quote: string, name: string, role: string}>" },
    ],
    example: {
      eyebrow: "Customers",
      heading: "What people are saying",
      body: "",
      items: [
        { quote: "Saved us a week.", name: "Jane Doe", role: "Marketing Lead, Acme" },
        { quote: "Replaced our copywriter.", name: "John Smith", role: "Founder, Beta Inc" },
      ],
    },
  },
  {
    name: "core/pricing-cards",
    title: "Pricing Cards",
    description: "Plan comparison cards.",
    category: "commerce",
    useFor: "pricing pages, plan comparison sections",
    fields: [
      { name: "eyebrow", type: "string", max: 80 },
      { name: "heading", type: "string", max: 120 },
      { name: "body", type: "string", max: 400 },
      { name: "plans", type: "Array<{name, price, description, features: string[], ctaLabel, ctaUrl, featured: boolean}>" },
    ],
    example: {
      eyebrow: "Pricing",
      heading: "Simple, fair pricing",
      body: "",
      plans: [
        { name: "Starter", price: "$0", description: "For trying it out.", features: ["1 site", "Basic blocks"], ctaLabel: "Start", ctaUrl: "/signup", featured: false },
        { name: "Pro", price: "$29/mo", description: "For real projects.", features: ["Unlimited sites", "All blocks", "AI credits"], ctaLabel: "Choose Pro", ctaUrl: "/signup?plan=pro", featured: true },
      ],
    },
  },
  {
    name: "core/faq",
    title: "FAQ",
    description: "Question/answer accordion.",
    category: "text",
    useFor: "FAQ sections, objection handling",
    fields: [
      { name: "eyebrow", type: "string", max: 80 },
      { name: "heading", type: "string", max: 120 },
      { name: "body", type: "string", max: 400 },
      { name: "items", type: "Array<{question: string, answer: string}>" },
    ],
    example: {
      eyebrow: "FAQ",
      heading: "Common questions",
      body: "",
      items: [
        { question: "How does it work?", answer: "Type a prompt, hit Generate." },
        { question: "Is it free?", answer: "There's a free tier." },
      ],
    },
  },

  // ── Wave B — additional marketing ─────────────────────────────────────────
  {
    name: "core/hero-text-only",
    title: "Hero (text only)",
    description: "Hero without media, for minimalist openers.",
    category: "marketing",
    useFor: "minimalist landing-page openers",
    avoid: "when the page benefits from product imagery (use core/hero or core/hero-split)",
    fields: [
      { name: "eyebrow", type: "string", max: 80 },
      { name: "title", type: "string", max: 120 },
      { name: "body", type: "string", max: 600 },
      { name: "alignment", type: '"center"|"left"' },
      { name: "primaryCtaLabel", type: "string" },
      { name: "primaryCtaUrl", type: "string" },
      { name: "secondaryCtaLabel", type: "string" },
      { name: "secondaryCtaUrl", type: "string" },
    ],
    example: { eyebrow: "Launching now", title: "A clean opener", body: "Short, punchy intro.", alignment: "center", primaryCtaLabel: "Get started", primaryCtaUrl: "/signup", secondaryCtaLabel: "", secondaryCtaUrl: "" },
  },
  {
    name: "core/hero-split",
    title: "Hero (split)",
    description: "Hero with copy on one side and media on the other.",
    category: "marketing",
    useFor: "SaaS landing pages with a product screenshot",
    fields: [
      { name: "title", type: "string", max: 120 },
      { name: "body", type: "string", max: 600 },
      { name: "mediaId", type: "string" },
      { name: "mediaSide", type: '"left"|"right"' },
    ],
    example: { eyebrow: "", title: "Two-column hero", body: "Copy + product shot.", mediaId: "", mediaAlt: "", mediaSide: "right", primaryCtaLabel: "Get started", primaryCtaUrl: "/signup", secondaryCtaLabel: "", secondaryCtaUrl: "" },
  },
  {
    name: "core/feature-list-alternating",
    title: "Feature list (alternating)",
    description: "Sequence of feature blocks with media alternating sides.",
    category: "marketing",
    useFor: "deeper feature storytelling sections",
    fields: [
      { name: "heading", type: "string", max: 120 },
      { name: "items", type: "Array<{title, body, mediaId, mediaAlt, ctaLabel, ctaUrl}>" },
    ],
    example: { eyebrow: "How it works", heading: "Three reasons to switch", body: "", items: [{ title: "Fast", body: "Sub-second responses.", mediaId: "", mediaAlt: "", ctaLabel: "", ctaUrl: "" }] },
  },
  {
    name: "core/logo-cloud",
    title: "Logo cloud",
    description: "Row of customer or partner logos.",
    category: "marketing",
    useFor: "social proof via brand logos",
    fields: [
      { name: "heading", type: "string", max: 120 },
      { name: "logos", type: "Array<{name, mediaId, href}>" },
    ],
    example: { eyebrow: "", heading: "Trusted by teams at", logos: [{ name: "Acme", mediaId: "", href: "" }] },
  },
  {
    name: "core/stats-band",
    title: "Stats band",
    description: "Big-number stats with labels.",
    category: "marketing",
    useFor: "headline metrics that build credibility",
    fields: [
      { name: "heading", type: "string", max: 120 },
      { name: "stats", type: "Array<{value: string, label: string}>" },
    ],
    example: { eyebrow: "", heading: "By the numbers", body: "", stats: [{ value: "10k+", label: "active users" }, { value: "99.9%", label: "uptime" }] },
  },
  {
    name: "core/team-grid",
    title: "Team grid",
    description: "Team members with photo, role, and bio.",
    category: "marketing",
    useFor: "about pages",
    fields: [
      { name: "heading", type: "string" },
      { name: "members", type: "Array<{name, role, bio, mediaId, href}>" },
    ],
    example: { eyebrow: "", heading: "The team", body: "", members: [{ name: "Jane Doe", role: "Founder", bio: "Background in design.", mediaId: "", href: "" }] },
  },
  {
    name: "core/comparison-table",
    title: "Comparison table",
    description: "Feature comparison versus competitors.",
    category: "marketing",
    useFor: "vs-competitor pages",
    fields: [
      { name: "columns", type: "Array<string>", hint: "First is row-label header; rest are alternatives" },
      { name: "rows", type: "Array<{label: string, cells: string[]}>" },
    ],
    example: { eyebrow: "", heading: "Compare", body: "", columns: ["Feature", "Us", "Them"], rows: [{ label: "Free tier", cells: ["✓", "✗"] }, { label: "AI built-in", cells: ["✓", "Add-on"] }] },
  },
  {
    name: "core/process-steps",
    title: "Process steps",
    description: "Numbered step-by-step process.",
    category: "marketing",
    useFor: "how-it-works sections",
    fields: [
      { name: "heading", type: "string" },
      { name: "steps", type: "Array<{title, body}>" },
    ],
    example: { eyebrow: "How it works", heading: "Three steps to ship", body: "", steps: [{ title: "Type a prompt", body: "Describe the page." }, { title: "Polish", body: "Drag and edit." }, { title: "Publish", body: "One click." }] },
  },
  {
    name: "core/roadmap-timeline",
    title: "Roadmap timeline",
    description: "Timeline of past, current, and upcoming items.",
    category: "marketing",
    useFor: "public roadmap pages",
    fields: [
      { name: "heading", type: "string" },
      { name: "items", type: "Array<{label, title, body, status: \"done\"|\"in_progress\"|\"planned\"}>" },
    ],
    example: { eyebrow: "Roadmap", heading: "What we're building", body: "", items: [{ label: "Q3 2026", title: "AI image gen", body: "Inline image generation.", status: "in_progress" }] },
  },
  {
    name: "core/bento-grid",
    title: "Bento grid",
    description: "Modern asymmetric feature layout — large + small cells.",
    category: "marketing",
    useFor: "Apple-style visual showcases",
    fields: [
      { name: "heading", type: "string" },
      { name: "items", type: 'Array<{title, body, mediaId, size: "small"|"medium"|"large", ctaLabel, ctaUrl}>' },
    ],
    example: { eyebrow: "", heading: "Highlights", body: "", items: [{ title: "AI everywhere", body: "Generate any block.", mediaId: "", size: "large", ctaLabel: "", ctaUrl: "" }] },
  },

  // ── Wave C — forms / conversions ──────────────────────────────────────────
  {
    name: "core/contact-form",
    title: "Contact form",
    description: "Configurable contact form with custom fields.",
    category: "forms",
    useFor: "contact pages, lead capture",
    fields: [
      { name: "heading", type: "string" },
      { name: "fields", type: "Array<{name, label, type: text|email|tel|textarea|select, required, placeholder, options[]}>" },
      { name: "submitLabel", type: "string" },
      { name: "recipientEmail", type: "string" },
    ],
    example: { eyebrow: "", heading: "Contact us", body: "", fields: [{ name: "name", label: "Name", type: "text", required: true, placeholder: "", options: [] }], submitLabel: "Send", recipientEmail: "hello@example.com", successMessage: "Thanks!" },
  },
  {
    name: "core/newsletter-signup",
    title: "Newsletter signup",
    description: "Email signup — inline or large card variant.",
    category: "forms",
    useFor: "growing email list anywhere on a page",
    fields: [
      { name: "heading", type: "string" },
      { name: "variant", type: '"inline"|"large"' },
    ],
    example: { eyebrow: "", heading: "Get weekly updates", body: "", placeholder: "you@company.com", submitLabel: "Subscribe", successMessage: "Check your inbox.", variant: "large" },
  },
  {
    name: "core/cta-with-form",
    title: "CTA with inline form",
    description: "Conversion CTA with email capture inline.",
    category: "forms",
    useFor: "page-bottom conversions",
    fields: [
      { name: "heading", type: "string" },
      { name: "fineprint", type: "string" },
    ],
    example: { eyebrow: "", heading: "Start free", body: "No credit card required.", placeholder: "you@company.com", submitLabel: "Try it", fineprint: "Cancel anytime." },
  },
  {
    name: "core/booking-cta",
    title: "Booking CTA",
    description: "Book-a-time CTA with optional embedded scheduler.",
    category: "forms",
    useFor: "demo or consultation booking",
    fields: [
      { name: "heading", type: "string" },
      { name: "ctaUrl", type: "string" },
      { name: "embedUrl", type: "string", hint: "Cal.com / Calendly embed URL — optional" },
    ],
    example: { eyebrow: "", heading: "Book a demo", body: "Pick a time that works.", ctaLabel: "Book", ctaUrl: "/contact", embedUrl: "" },
  },

  // ── Wave D — content discovery (skill fetches data) ───────────────────────
  {
    name: "core/latest-posts",
    title: "Latest posts",
    description: "Auto-list of recent blog posts.",
    category: "site",
    useFor: "homepage blog teaser",
    fields: [
      { name: "heading", type: "string" },
      { name: "count", type: "number", hint: "1-24" },
      { name: "categorySlug", type: "string" },
      { name: "tagSlug", type: "string" },
    ],
    example: { eyebrow: "", heading: "From the blog", body: "", count: 3, categorySlug: "", tagSlug: "", showExcerpts: true, showAuthors: true },
  },
  {
    name: "core/featured-products",
    title: "Featured products",
    description: "Product grid — hand-picked or latest.",
    category: "commerce",
    useFor: "store homepage, product showcases",
    fields: [
      { name: "heading", type: "string" },
      { name: "productIds", type: "Array<string>", hint: "Convex commerce_products _ids; empty = latest" },
      { name: "count", type: "number" },
    ],
    example: { eyebrow: "", heading: "Featured", body: "", productIds: [], count: 4, showPrice: true },
  },
  {
    name: "core/author-bio",
    title: "Author bio",
    description: "Author card with photo, role, bio, and links.",
    category: "site",
    useFor: "blog post footers, about-the-author sections",
    fields: [
      { name: "userId", type: "string", hint: "Convex users _id (empty = use page author)" },
      { name: "name", type: "string" },
      { name: "bio", type: "string" },
      { name: "links", type: "Array<{label, href}>" },
    ],
    example: { userId: "", name: "Jane Doe", role: "Author", bio: "Writes about software.", mediaId: "", links: [] },
  },
  {
    name: "core/social-links",
    title: "Social links",
    description: "Icon row of social profile links.",
    category: "site",
    useFor: "footers, about pages",
    fields: [
      { name: "links", type: "Array<{platform, label, href}>" },
    ],
    example: { heading: "Find us", links: [{ platform: "twitter", label: "Twitter", href: "https://twitter.com/example" }] },
  },
  {
    name: "core/tag-cloud",
    title: "Tag cloud",
    description: "Auto-generated tag list.",
    category: "site",
    useFor: "blog discovery sections",
    fields: [
      { name: "heading", type: "string" },
      { name: "max", type: "number" },
    ],
    example: { heading: "Topics", max: 30 },
  },

  // ── Wave E — layout containers ────────────────────────────────────────────
  {
    name: "core/accordion",
    title: "Accordion",
    description: "Collapsible Q&A or progressive-disclosure list.",
    category: "layout",
    useFor: "FAQ-adjacent content, docs sections",
    fields: [
      { name: "heading", type: "string" },
      { name: "items", type: "Array<{title, body}>" },
    ],
    example: { heading: "Details", body: "", items: [{ title: "What's included?", body: "Everything in the core plan." }], defaultOpen: 0 },
  },
  {
    name: "core/tabs",
    title: "Tabs",
    description: "Tabbed content panels.",
    category: "layout",
    useFor: "segmenting comparable content into tabs",
    fields: [
      { name: "tabs", type: "Array<{label, body}>" },
    ],
    example: { heading: "", tabs: [{ label: "Overview", body: "..." }, { label: "Details", body: "..." }] },
  },
];

const BLOCK_CATALOG_BY_NAME = new Map(BLOCK_CATALOG.map((b) => [b.name, b]));

export function getCatalogEntry(name: string): BlockCatalogEntry | undefined {
  return BLOCK_CATALOG_BY_NAME.get(name);
}

export type BlockAttrsValidationResult =
  | { ok: true }
  | { ok: false; message: string };

function parseLiteralOptions(type: string): string[] {
  const matches = type.match(/"([^"]+)"/g);
  return matches ? matches.map((match) => match.slice(1, -1)) : [];
}

function isArrayType(type: string): boolean {
  return /^Array</.test(type) || type.endsWith("[]");
}

function valueKind(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

/**
 * Lightweight runtime validation for attrs generated or saved through the
 * backend. Zod remains the strongest frontend editor contract; this catalog
 * check is intentionally dependency-free so Convex actions/mutations can
 * reject obviously wrong AI/custom data before it lands in the database.
 */
export function validateAttrsForCatalogEntry(
  blockName: string,
  attrs: Record<string, unknown>,
): BlockAttrsValidationResult {
  const catalog = getCatalogEntry(blockName);
  if (!catalog) {
    return { ok: false, message: `Unknown block type: ${blockName}` };
  }

  for (const field of catalog.fields) {
    const value = attrs[field.name];
    if (value === undefined || value === null) continue;

    if (field.max && typeof value === "string" && value.length > field.max) {
      return {
        ok: false,
        message: `${blockName}.${field.name} exceeds ${field.max} characters`,
      };
    }

    const type = field.type.trim();
    const literals = parseLiteralOptions(type);
    if (literals.length > 0) {
      if (typeof value !== "string" || !literals.includes(value)) {
        return {
          ok: false,
          message: `${blockName}.${field.name} must be one of: ${literals.join(", ")}`,
        };
      }
      continue;
    }

    if (type === "string" && typeof value !== "string") {
      return {
        ok: false,
        message: `${blockName}.${field.name} must be a string, got ${valueKind(value)}`,
      };
    }

    if (type === "number" && typeof value !== "number") {
      return {
        ok: false,
        message: `${blockName}.${field.name} must be a number, got ${valueKind(value)}`,
      };
    }

    if (type === "boolean" && typeof value !== "boolean") {
      return {
        ok: false,
        message: `${blockName}.${field.name} must be a boolean, got ${valueKind(value)}`,
      };
    }

    if (isArrayType(type) && !Array.isArray(value)) {
      return {
        ok: false,
        message: `${blockName}.${field.name} must be an array, got ${valueKind(value)}`,
      };
    }
  }

  return { ok: true };
}

/**
 * Build the system prompt section describing every block. Inlined into every
 * AI page-generation or per-block AI request.
 */
export function buildBlockCatalogPrompt(disabledBlockNames?: readonly string[]): string {
  const disabled = new Set((disabledBlockNames ?? []).map(String));
  const availableBlocks = BLOCK_CATALOG.filter((block) => !disabled.has(block.name));
  const lines: string[] = [];
  lines.push("# AVAILABLE BLOCKS");
  lines.push("");
  lines.push(
    "Each block below has a name, when-to-use, when-to-avoid, the fields you must produce, and an example.",
  );
  lines.push("");

  for (const block of availableBlocks) {
    lines.push(`## ${block.name} — ${block.title}`);
    lines.push(block.description);
    if (block.useFor) lines.push(`USE FOR: ${block.useFor}`);
    if (block.avoid) lines.push(`AVOID: ${block.avoid}`);
    lines.push("FIELDS:");
    for (const f of block.fields) {
      const max = f.max ? ` (max ${f.max} chars)` : "";
      const hint = f.hint ? ` — ${f.hint}` : "";
      lines.push(`  - ${f.name}: ${f.type}${max}${hint}`);
    }
    lines.push("EXAMPLE:");
    lines.push(JSON.stringify(block.example, null, 2));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Page-level generation system prompt.
 */
export function buildPageGenerationPrompt(opts: {
  pageType?: string;
  pageTitle?: string;
  skillContext?: string;
  disabledBlockNames?: readonly string[];
}): string {
  return [
    "You are a content composer for ConvexPress, an AI-first CMS.",
    "Your job is to compose a sequence of blocks that forms a complete page.",
    "",
    "## YOUR TASK",
    "Given the user's prompt, produce a JSON array of blocks. Each block must:",
    "  - have one of the names from the catalog below",
    "  - have an `attrs` object matching the fields described for that block",
    "  - have a unique id of the form `blk_<random>`",
    '  - have `"version": 1`',
    "",
    "Return ONLY the JSON array, wrapped in a ```json code fence. No prose before or after.",
    "",
    opts.pageTitle ? `## PAGE TITLE\n${opts.pageTitle}\n` : "",
    opts.pageType ? `## PAGE TYPE\n${opts.pageType}\n` : "",
    opts.skillContext ? `## ACTIVE SKILL / THEME CONTEXT\n${opts.skillContext}\n` : "",
    buildBlockCatalogPrompt(opts.disabledBlockNames),
    "",
    "## OUTPUT FORMAT",
    "```json",
    "[",
    '  { "id": "blk_xxx", "name": "core/hero", "version": 1, "attrs": { ... } },',
    '  { "id": "blk_yyy", "name": "core/feature-grid", "version": 1, "attrs": { ... } }',
    "]",
    "```",
  ].filter(Boolean).join("\n");
}

/**
 * Per-block regeneration system prompt.
 */
export function buildBlockRegenerationPrompt(opts: {
  blockName: string;
  currentAttrs: Record<string, unknown>;
  pageContext?: string;
  refinement?: string;
}): string {
  const entry = getCatalogEntry(opts.blockName);
  return [
    "You are rewriting a single block for ConvexPress.",
    "Return ONLY a JSON object representing the new `attrs` for this block, wrapped in a ```json code fence. No prose.",
    "",
    `## BLOCK TYPE\n${opts.blockName} — ${entry?.title ?? ""}\n${entry?.description ?? ""}`,
    entry ? `FIELDS:\n${entry.fields.map((f) => `  - ${f.name}: ${f.type}${f.max ? ` (max ${f.max})` : ""}`).join("\n")}` : "",
    "",
    "## CURRENT CONTENT",
    "```json",
    JSON.stringify(opts.currentAttrs, null, 2),
    "```",
    "",
    opts.refinement ? `## REFINEMENT REQUEST\n${opts.refinement}\n` : "## INSTRUCTION\nRewrite this block keeping the same intent but with fresh phrasing.\n",
    opts.pageContext ? `## PAGE CONTEXT\n${opts.pageContext}\n` : "",
    "",
    "## OUTPUT FORMAT",
    "```json",
    "{ /* the new attrs */ }",
    "```",
  ].filter(Boolean).join("\n");
}

/**
 * Per-block improve preset → refinement text.
 */
export function refinementForImprovePreset(
  preset: "shorter" | "longer" | "formal" | "casual" | "technical" | "playful",
): string {
  switch (preset) {
    case "shorter":
      return "Make the content noticeably shorter while keeping the core message intact.";
    case "longer":
      return "Expand the content with more useful detail, but stay focused — no fluff.";
    case "formal":
      return "Shift the tone to be more formal and professional.";
    case "casual":
      return "Shift the tone to be more casual and conversational.";
    case "technical":
      return "Use more technical precision. Assume a developer audience.";
    case "playful":
      return "Inject some personality — playful, warm, a touch of wit.";
  }
}

/**
 * Extract a JSON value from an LLM response.
 *
 * Models are inconsistent: sometimes they wrap in ```json fences, sometimes
 * not, sometimes there's prose. This is best-effort but robust.
 */
export function extractJson(text: string): unknown {
  // Try fenced block first.
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fence?.[1] ?? text;

  // Try direct parse.
  try {
    return JSON.parse(candidate);
  } catch {
    // Fall through.
  }

  // Try to find the first {...} or [...] balanced span.
  const trimmed = (candidate ?? "").trim();
  const firstBracket = trimmed.search(/[[{]/);
  if (firstBracket >= 0) {
    const opener = trimmed[firstBracket];
    const closer = opener === "[" ? "]" : "}";
    let depth = 0;
    for (let i = firstBracket; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === opener) depth++;
      else if (ch === closer) {
        depth--;
        if (depth === 0) {
          const slice = trimmed.slice(firstBracket, i + 1);
          try {
            return JSON.parse(slice);
          } catch {
            // continue
          }
        }
      }
    }
  }

  throw new Error("LLM response did not contain valid JSON");
}
