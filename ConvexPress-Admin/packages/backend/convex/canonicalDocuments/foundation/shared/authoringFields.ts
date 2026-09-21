// Pure shared inventory of revisioned authoring fields.
export type AuthoringField = "title" | "content" | "excerpt" | "contentMode" | "blocks" | "blocksVersion"
  | "blocksRevision" | "hero" | "topics" | "summary" | "sources" | "tableOfContents"
  | "featuredImageId" | "pageSections" | "pageTemplate" | "hideHeader" | "hideFooter" | "layoutId" | "pagePrompt" | "composedDefinitions";
export const AUTHORING_FIELDS: readonly AuthoringField[] = [
  "title", "content", "excerpt", "contentMode", "blocks", "blocksVersion",
  "blocksRevision", "hero", "topics", "summary", "sources", "tableOfContents",
  "featuredImageId", "pageSections", "pageTemplate", "hideHeader", "hideFooter", "layoutId", "pagePrompt",
  "composedDefinitions",
];
