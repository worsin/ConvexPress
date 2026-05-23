export const PAGE_TEMPLATES = [
  {
    id: "default",
    name: "Default Template",
    description: "Standard page layout with sidebar",
    supports: { featuredImage: true, excerpt: true, customFields: true, comments: true },
  },
  {
    id: "full-width",
    name: "Full Width",
    description: "Full-width layout without sidebar",
    supports: { featuredImage: true, excerpt: true, customFields: true, comments: true },
  },
  {
    id: "sidebar-left",
    name: "Sidebar Left",
    description: "Content with left sidebar",
    supports: { featuredImage: true, excerpt: true, customFields: true, comments: true },
  },
  {
    id: "sidebar-right",
    name: "Sidebar Right",
    description: "Content with right sidebar",
    supports: { featuredImage: true, excerpt: true, customFields: true, comments: true },
  },
  {
    id: "no-sidebar",
    name: "No Sidebar",
    description: "Content-only layout at the theme reading width",
    supports: { featuredImage: true, excerpt: true, customFields: true, comments: true },
  },
  {
    id: "landing",
    name: "Landing Page",
    description: "Clean layout for landing pages, no header/footer nav",
    supports: { featuredImage: true, excerpt: false, customFields: true, comments: false },
  },
  {
    id: "blank",
    name: "Blank Canvas",
    description: "Completely blank - only renders the content",
    supports: { featuredImage: false, excerpt: false, customFields: true, comments: false },
  },
] as const;
