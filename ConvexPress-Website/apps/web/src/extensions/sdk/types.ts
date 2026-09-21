/** Website extension metadata. Dashboard entries reference backend registry IDs. */
export interface WebsiteExtensionManifest {
  id: string;
  title: string;
  settingsKey: string;
  defaultEnabled?: boolean;
  aliases?: string[];
  legacySettingsKeys?: string[];
  parentId?: string;
  routePrefixes: string[];
  surfaces: Array<{ id: string; title: string; area: string; viewModel: string; gate?: string }>;
  parts: string[];
  dashboardNav: Array<{ pageId: string }>;
  chromeParts: string[];
}
