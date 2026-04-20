export type PageComposerTemplateId =
  | "homepage"
  | "landing"
  | "default"
  | "full-width"
  | "sidebar-left"
  | "sidebar-right"
  | "blank";

export type PageSectionType =
  | "hero"
  | "feature-grid"
  | "story-split"
  | "pricing-cards"
  | "testimonial-band"
  | "cta-band"
  | "rich-text";

export interface PageSectionShell {
  tone?: "default" | "muted" | "accent" | "contrast";
  padding?: "normal" | "spacious";
  container?: "content" | "wide";
}

export interface PageSection {
  id: string;
  type: PageSectionType;
  variant?: string;
  shell?: PageSectionShell;
  data?: Record<string, unknown>;
}

export interface PageTemplateManifest {
  id: PageComposerTemplateId;
  label: string;
  description: string;
  editorMode: "content" | "sections";
  allowedSections: PageSectionType[];
  defaultSections: PageSection[];
  supports: {
    featuredImage: boolean;
    excerpt: boolean;
    comments: boolean;
  };
}

function sectionId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultSection(type: PageSectionType): PageSection {
  switch (type) {
    case "hero":
      return {
        id: sectionId("hero"),
        type: "hero",
        variant: "editorial",
        shell: { tone: "default", padding: "spacious", container: "wide" },
        data: {
          eyebrow: "New section",
          title: "A page opening that feels intentional",
          body: "Use the shared media library, structured copy, and strong calls to action without building a freeform page builder.",
          primaryCtaLabel: "Get started",
          primaryCtaUrl: "/contact",
          secondaryCtaLabel: "See examples",
          secondaryCtaUrl: "/blog",
          mediaId: "",
        },
      };
    case "feature-grid":
      return {
        id: sectionId("features"),
        type: "feature-grid",
        shell: { tone: "muted", padding: "normal", container: "content" },
        data: {
          eyebrow: "Highlights",
          heading: "A reusable feature grid",
          body: "Add a concise section intro and then fill the cards below.",
          items: [
            { title: "Clear positioning", description: "Keep the message sharp and scannable." },
            { title: "Structured content", description: "Editors fill fields instead of designing pages." },
            { title: "Shared design system", description: "Variants stay on-brand without per-page CSS." },
          ],
        },
      };
    case "story-split":
      return {
        id: sectionId("story"),
        type: "story-split",
        shell: { tone: "default", padding: "normal", container: "wide" },
        data: {
          eyebrow: "Story",
          heading: "Tell the story beside an image",
          body: "This section is good for a founder note, a process overview, or a product narrative.",
          ctaLabel: "Learn more",
          ctaUrl: "/about",
          mediaId: "",
        },
      };
    case "pricing-cards":
      return {
        id: sectionId("pricing"),
        type: "pricing-cards",
        shell: { tone: "accent", padding: "normal", container: "wide" },
        data: {
          eyebrow: "Pricing",
          heading: "Three pricing cards",
          body: "Use this for service tiers, retainers, or product plans.",
          plans: [
            { name: "Starter", price: "$950", period: "per launch", description: "Best for a focused one-page rollout.", features: "Strategy call\nSingle landing page\nLaunch checklist", ctaLabel: "Choose Starter", ctaUrl: "/contact", featured: false },
            { name: "Studio", price: "$2,400", period: "per project", description: "A balanced setup for a polished marketing site.", features: "Homepage + 4 pages\nEditorial layout system\nContent guidance", ctaLabel: "Choose Studio", ctaUrl: "/contact", featured: true },
            { name: "Signature", price: "$4,800", period: "per build", description: "For brands that need a richer content system.", features: "Custom sections\nRecipe or resource hub\nLaunch support", ctaLabel: "Choose Signature", ctaUrl: "/contact", featured: false },
          ],
        },
      };
    case "testimonial-band":
      return {
        id: sectionId("testimonials"),
        type: "testimonial-band",
        shell: { tone: "muted", padding: "normal", container: "wide" },
        data: {
          eyebrow: "Proof",
          heading: "Testimonials that read like actual clients",
          body: "Use short quotes and keep the names credible.",
          testimonials: [
            { quote: "We finally had a site that looked designed, not assembled.", name: "Mara Ellison", role: "Founder, Cedar Table" },
            { quote: "The page system gave us enough flexibility without handing the team a mess.", name: "Jonas Pike", role: "Creative Director, Field Journal" },
          ],
        },
      };
    case "cta-band":
      return {
        id: sectionId("cta"),
        type: "cta-band",
        shell: { tone: "contrast", padding: "normal", container: "content" },
        data: {
          eyebrow: "Call to action",
          heading: "End the page with a clear next step",
          body: "One strong CTA is usually enough.",
          primaryCtaLabel: "Book a project",
          primaryCtaUrl: "/contact",
          secondaryCtaLabel: "Read the journal",
          secondaryCtaUrl: "/blog",
        },
      };
    case "rich-text":
      return {
        id: sectionId("text"),
        type: "rich-text",
        shell: { tone: "default", padding: "normal", container: "content" },
        data: {
          eyebrow: "Text block",
          heading: "A flexible copy section",
          body: "Use this when you need a simple editorial text block between more structured sections.",
        },
      };
  }
}

export const PAGE_TEMPLATE_MANIFESTS: Record<PageComposerTemplateId, PageTemplateManifest> = {
  homepage: {
    id: "homepage",
    label: "Homepage",
    description: "Section-composed homepage with a curated marketing stack.",
    editorMode: "sections",
    allowedSections: ["hero", "feature-grid", "story-split", "pricing-cards", "testimonial-band", "cta-band", "rich-text"],
    defaultSections: [
      createDefaultSection("hero"),
      createDefaultSection("feature-grid"),
      createDefaultSection("story-split"),
      createDefaultSection("testimonial-band"),
      createDefaultSection("cta-band"),
    ],
    supports: {
      featuredImage: false,
      excerpt: false,
      comments: false,
    },
  },
  landing: {
    id: "landing",
    label: "Landing Page",
    description: "A conversion-oriented section stack for focused landing pages.",
    editorMode: "sections",
    allowedSections: ["hero", "feature-grid", "pricing-cards", "testimonial-band", "cta-band", "rich-text"],
    defaultSections: [
      createDefaultSection("hero"),
      createDefaultSection("feature-grid"),
      createDefaultSection("pricing-cards"),
      createDefaultSection("cta-band"),
    ],
    supports: {
      featuredImage: false,
      excerpt: false,
      comments: false,
    },
  },
  default: {
    id: "default",
    label: "Default Template",
    description: "Standard content page with the classic editor surface.",
    editorMode: "content",
    allowedSections: [],
    defaultSections: [],
    supports: { featuredImage: true, excerpt: true, comments: true },
  },
  "full-width": {
    id: "full-width",
    label: "Full Width",
    description: "Single-column content page.",
    editorMode: "content",
    allowedSections: [],
    defaultSections: [],
    supports: { featuredImage: true, excerpt: true, comments: true },
  },
  "sidebar-left": {
    id: "sidebar-left",
    label: "Sidebar Left",
    description: "Content page with a left sidebar.",
    editorMode: "content",
    allowedSections: [],
    defaultSections: [],
    supports: { featuredImage: true, excerpt: true, comments: true },
  },
  "sidebar-right": {
    id: "sidebar-right",
    label: "Sidebar Right",
    description: "Content page with a right sidebar.",
    editorMode: "content",
    allowedSections: [],
    defaultSections: [],
    supports: { featuredImage: true, excerpt: true, comments: true },
  },
  blank: {
    id: "blank",
    label: "Blank Canvas",
    description: "Minimal content canvas with no extra chrome.",
    editorMode: "content",
    allowedSections: [],
    defaultSections: [],
    supports: { featuredImage: false, excerpt: false, comments: false },
  },
};

export function getPageTemplateManifest(templateId?: string): PageTemplateManifest {
  return PAGE_TEMPLATE_MANIFESTS[(templateId as PageComposerTemplateId) || "default"] ?? PAGE_TEMPLATE_MANIFESTS.default;
}
