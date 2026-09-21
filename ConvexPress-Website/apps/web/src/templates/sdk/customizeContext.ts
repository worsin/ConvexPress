import { createContext } from "react";

type Values = Record<string, Record<string, unknown>>;
export interface PreviewDraft {
  packId: string | null;
  values: Values;
  variants: Record<string, string>;
}
export const EMPTY_PREVIEW: PreviewDraft = {
  packId: null,
  values: {},
  variants: {},
};
export const TemplateDraftContext = createContext({
  draft: EMPTY_PREVIEW,
  open: false,
  setOpen: (_open: boolean) => {},
  setDraft: (_draft: PreviewDraft) => {},
  surfaceIds: [] as string[],
  readFields: [] as string[],
  reportSurface: (_instance: string, _surface: string | null) => {},
  reportReads: (_instance: string, _fields: string[] | null) => {},
});
export const TemplateSurfaceContext = createContext<string | null>(null);
