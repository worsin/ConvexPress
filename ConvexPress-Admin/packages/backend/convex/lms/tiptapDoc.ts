/**
 * Exact transport for the Tiptap (ProseMirror JSON) documents LMS authoring
 * sends: course descriptions and materials, certificate templates.
 *
 * Every writer builds these documents with a `textToDoc` helper (the admin
 * course and certificate editors, lms/lessons/helpers.ts, lms/ai/helpers.ts),
 * so their shape is fixed: nodes carry a type, optional scalar attrs, optional
 * child content, and text nodes carry text and optional marks. The deepest
 * document those helpers produce is doc > list > listItem > paragraph > text,
 * five levels, so the tree is unrolled to TIPTAP_DOC_LEVELS (eight) with room
 * to spare.
 */
import { v, type Validator } from "convex/values";

import { boundedTreeValidator } from "../helpers/boundedTree";

export type TiptapAttrValue = string | number | boolean | null;
export type TiptapAttrs = Record<string, TiptapAttrValue>;
export type TiptapMark = { type: string; attrs?: TiptapAttrs };
export type TiptapNode = {
  type: string;
  attrs?: TiptapAttrs;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
};

/** Node levels the document validator accepts, the document node included. */
export const TIPTAP_DOC_LEVELS = 8;

const tiptapAttrsValidator = v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()));
const tiptapMarkValidator = v.object({ type: v.string(), attrs: v.optional(tiptapAttrsValidator) });

export const tiptapDocValidator: Validator<TiptapNode, "required", string> = boundedTreeValidator<TiptapNode>(
  TIPTAP_DOC_LEVELS,
  (children) =>
    v.object({
      type: v.string(),
      attrs: v.optional(tiptapAttrsValidator),
      content: v.optional(children),
      marks: v.optional(v.array(tiptapMarkValidator)),
      text: v.optional(v.string()),
    }),
);
