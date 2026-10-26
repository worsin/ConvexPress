import { TEMPLATE_PACKS } from "./packs";

/** Core page layouts, as every template pack draws them. */
export const CORE_PAGE_LAYOUTS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "default", label: "Template default" },
  { value: "full-width", label: "Full width" },
  { value: "no-sidebar", label: "Reading width" },
  { value: "sidebar-left", label: "Sidebar on the left" },
  { value: "sidebar-right", label: "Sidebar on the right" },
  { value: "landing", label: "Landing page" },
  { value: "blank", label: "Blank canvas" },
];

/**
 * Every layout a page can use: Core's, then those installed template packs add
 * (named with their pack, since a pack's layouts render only while it is active).
 */
export function pageLayoutOptions(): Array<{ value: string; label: string }> {
  const added = TEMPLATE_PACKS.flatMap((pack) =>
    (pack.pageTemplates ?? []).map((template) => ({ value: template.id, label: `${template.name} (${pack.name})` })),
  );
  return [...CORE_PAGE_LAYOUTS, ...added];
}
