import {validateCanonicalTree} from './generated/instances';
import {anchorDescriptors} from './generated/metadata';
import {collectCanonicalAnchors} from './generated/instance-runtime.mjs';
import {sha256Hex} from './shared/fingerprints';
import type {ComposedRegistry, RuntimeCanonicalBlock} from './composedRegistry';
import {anchorFields} from './generated/spec-runtime.mjs';
import type {NavigationResult} from './navigationContracts';

/** Pure, versioned tree projection shared by the backend and actual renderer.
 * Derived heading IDs do not alter storage, authored anchors, labels or marks. */
export function navigationTreeIndex(input: unknown, extension?: {registry: ComposedRegistry; renderedAnchors?: readonly string[]}) {
  const tree = extension ? extension.registry.validateTree(input) : validateCanonicalTree(input);
  const nodes: RuntimeCanonicalBlock[] = [];
  const visit = (items: RuntimeCanonicalBlock[]) => {
    for (const node of items) {nodes.push(node); if (node.children) visit(node.children);}
  };
  visit(tree);
  const reserved = new Set<string>(extension?.renderedAnchors ?? []);
  for (const node of nodes) {
    if (node.anchor) reserved.add(node.anchor);
    const definition = extension?.registry.definition(node.name, node.version);
    const fields = definition ? anchorFields(definition.spec.fields) : (anchorDescriptors as Record<string, readonly {path: readonly string[]}[]>)[node.name] ?? [];
    for (const entry of collectCanonicalAnchors(node.attrs, fields)) reserved.add(entry.value);
  }
  const headingAnchors: Record<string, string> = Object.create(null);
  const headings: NavigationResult<'content.headings'>['items'] = [];
  const anchors: NavigationResult<'content.anchors'>['items'] = [];
  for (const node of nodes) {
    let title: string | null = null;
    if (node.name === 'core/heading') {
      title = (node.attrs.text?.content ?? []).flatMap(p => p.content ?? []).map(inline => inline.type === 'text' ? inline.text : ' ').join('').replace(/\s+/gu, ' ').trim();
      let id = node.attrs.anchor || '';
      if (!id) {
        const base = `cp-heading-${sha256Hex(node.id).slice(0, 24)}`;
        id = base;
        for (let suffix = 2; reserved.has(id); suffix++) id = `${base}-${suffix}`;
        reserved.add(id);
      }
      headingAnchors[node.id] = id;
      if (title) headings.push({label: title, anchor: id, level: node.attrs.level});
    }
    // Auto navigation follows authored wrapper anchors, or headings where a
    // wrapper anchor is absent. It does not manufacture labels from hidden data.
    const target = node.anchor || headingAnchors[node.id];
    if (target) anchors.push({label: title || target.replace(/[-_]/gu, ' '), anchor: target});
  }
  for (const node of nodes) {
    if (node.name !== 'core/anchor-nav' || node.attrs.source !== 'manual') continue;
    for (const item of node.attrs.items) {
      if (!reserved.has(item.anchor)) throw new Error(`Anchor navigation target is absent from this document: ${item.anchor}`);
    }
  }
  return {headingAnchors, headings, anchors};
}
