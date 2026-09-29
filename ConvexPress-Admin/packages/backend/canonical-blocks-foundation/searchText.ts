import { installedPromotionDefinition } from "./installedPromotion";
import { blockHtmlText } from "./html";
import { parseExpression, evaluateExpression, type Expression } from "./compositionExpressions";
import type { CompositionNode } from "./composition";
import { searchTextDescriptors } from "./generated/search-text";
import { validateBlockAttrs } from "./generated/schemas";
import { searchableFields } from "./generated/spec-runtime.mjs";
import { composedAttrsSchema, type ComposedDefinition } from "./composedDefinitions";
import type { ResolvedCompositionNode } from "./composition";

interface TextField { readonly path: readonly string[]; readonly type: "text" | "richtext" | "prose" }
const descriptors: Readonly<Record<string, readonly TextField[]>> = searchTextDescriptors;
const MAX_TEXT = 100_000;

function valuesAt(value: unknown, path: readonly string[]): unknown[] {
  if (!path.length) return [value];
  const [head, ...tail] = path;
  if (head === "*") return Array.isArray(value) ? value.flatMap(item => valuesAt(item, tail)) : [];
  return value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, head)
    ? valuesAt((value as Record<string, unknown>)[head], tail) : [];
}

/** Already validated richtext; marks and their URLs are deliberately ignored.
 * Adjacent marked runs form one word; paragraph and hard-break boundaries do not. */
function richText(value: unknown): string {
  const doc = value as { content: { content?: ({ type: "text"; text: string } | { type: "hardBreak" })[] }[] };
  return doc.content.map(paragraph => (paragraph.content ?? []).map(node => node.type === "text" ? node.text : "\n").join("")).join("\n");
}

/** Match the SDK Prose adapter's deliberately small inline grammar exactly.
 * Unsupported Markdown is rendered literally, so it must stay literal here. */
export function proseText(value: string): string {
  return value.split(/\n\s*\n/u).map(paragraph => paragraph.replace(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/gu, token => {
    if (token.startsWith("**")) return token.slice(2, -2);
    if (token.startsWith("*")) return token.slice(1, -1);
    return /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(token)![1];
  })).join("\n\n");
}

/** Candidate text, NOT a public DTO. Callers must authorize the current document,
 * ancestors, visibility, plugins and immutable definitions before public use.
 * Never follows references or invokes dynamic resolvers (including search itself). */
export function authoredBlockSearchText(name: string, input: unknown, project?: (attrs: unknown) => unknown): string {
  if (!Object.prototype.hasOwnProperty.call(descriptors, name)) throw Error("Unknown search block");
  const attrs = validateBlockAttrs(name, input);
  if (name === "core/custom-html") return blockHtmlText((attrs as {html:string}).html);
  const promoted = installedPromotionDefinition(name);
  if (promoted) return authoredPresentationSearchText(promoted, attrs);
  return declaredSearchText(project ? project(attrs) : attrs, descriptors[name]);
}

function declaredSearchText(attrs: unknown, fields: readonly TextField[]): string {
  const pieces: string[] = [];
  let remaining = MAX_TEXT;
  for (const field of fields) {
    for (const value of valuesAt(attrs, field.path)) {
      if (value === null || value === undefined) continue;
      const text = (field.type === "richtext" ? richText(value) : field.type === "prose" ? proseText(String(value)) : String(value)).replace(/\s+/gu, " ").trim();
      if (!text) continue;
      const piece = text.slice(0, remaining);
      pieces.push(piece);
      remaining -= piece.length + 1;
      if (remaining <= 0) return pieces.join(" ");
    }
  }
  return pieces.join(" ");
}

/** Authored candidate corpus from an exact definition. Conditions and pack
 * alternatives are intentionally a superset; current presentation is authority. */
export function authoredComposedSearchText(definition: ComposedDefinition, input: unknown): string {
  return declaredSearchText(composedAttrsSchema(definition).parse(input), searchableFields(definition.spec.fields, definition.spec.searchText ?? []));
}

/** A resolved, validated SDK presentation only. Enumerate visible prose, never
 * stringify props: links, media IDs/URLs, anchors and configuration are not text.
 * The caller supplies already-authorized child text at the actual child slot. */
export function resolvedCompositionSearchText(root: ResolvedCompositionNode | null, children: string): string {
  const parts: string[] = [];
  let remaining = MAX_TEXT;
  const append = (value: unknown) => {
    if (typeof value !== "string" || remaining <= 0) return;
    const text = value.replace(/\s+/gu, " ").trim().slice(0, remaining);
    if (text) { parts.push(text); remaining -= text.length + 1; }
  };
  const visit = (node: ResolvedCompositionNode) => {
    if (remaining <= 0) return;
    const p = node.props;
    switch (node.el) {
      case "Heading": case "Eyebrow": case "Text": append(node.text); break;
      case "RichText": append(richText(p.content)); break;
      case "Image": append(p.caption); break;
      case "Video": append(p.title); break;
      case "Button": case "Link": case "Badge": append(p.label); break;
      case "Stat": append(p.value); append(p.label); append(p.detail); break;
      case "Quote": append(p.quote); append(p.attribution); append(p.source); break;
      case "List": case "Marquee": for (const value of p.items as string[]) append(value); break;
      case "Accordion": case "Tabs":
        for (const item of p.items as { title: string; body: string }[]) { append(item.title); append(item.body); }
        break;
      case "Slot": append(children); break;
    }
    node.children.forEach(visit);
  };
  if (root) visit(root);
  return parts.join(" ");
}

/** Candidate-only traversal of reviewed primitive prose. Conditions and pack
 * alternatives are a superset. Data-dependent loops/expressions are omitted;
 * current public resolution remains the sole display/match authority. */
export function authoredPresentationSearchText(definition: ComposedDefinition, input: unknown): string {
 const attrs = composedAttrsSchema(definition).parse(input);
 const parts: string[] = []; let work=0, remaining=MAX_TEXT;
 const dependsOnData=(e:Expression):boolean=>e.kind==='path'?e.parts[0]==='data':e.kind==='concat'?e.items.some(dependsOnData):e.kind==='format'?e.args.some(dependsOnData):false;
 const evaluate=(source:string,scope:Record<string,unknown>)=>{
  const expression=parseExpression(source,new Set([...Object.keys(scope),'data']));
  if(dependsOnData(expression))return undefined;
  const optional=(e:Expression):unknown=>{
   if(e.kind==='literal')return e.value;
   if(e.kind==='path'){
    let value:unknown=scope;
    for(const key of e.parts){if(!value||typeof value!=='object')return undefined;const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!('value' in field))return undefined;value=field.value;}return value;
   }
   const values=(e.kind==='concat'?e.items:e.args).map(optional);
   if(values.some(value=>value===undefined||value===null))return undefined;
   return evaluateExpression(e,scope);
  };
  return optional(expression);
 };
 const fields:Readonly<Record<string,readonly string[]>>={RichText:['content'],Image:['caption'],Video:['title'],Button:['label'],Link:['label'],Badge:['label'],Stat:['value','label','detail'],Quote:['quote','attribution','source'],List:['items'],Marquee:['items'],Accordion:['items'],Tabs:['items']};
 const visit=(node:CompositionNode,scope:Record<string,unknown>)=>{
  if (++work>5000) throw Error('Candidate composition exceeds work budget');
  if(remaining<=0)return;
  const props:Record<string,unknown>={};
  for(const key of fields[node.el]??[]) {
   const value=node.bind&&typeof node.bind==='object'&&Object.prototype.hasOwnProperty.call(node.bind,key)?evaluate(node.bind[key],scope):node.props?.[key];
   if(value!==undefined)props[key]=value;
  }
  const text=typeof node.bind==='string'?evaluate(node.bind,scope):undefined;
  // Absent data bindings are not fabricated into richtext or item arrays.
  const safe={...props};if(node.el==='RichText'&&safe.content===undefined)safe.content={content:[]};
  if(['List','Marquee','Accordion','Tabs'].includes(node.el)&&safe.items===undefined)safe.items=[];
  const piece=resolvedCompositionSearchText({el:node.el,props:safe,text:typeof text==='number'?String(text):typeof text==='string'?text:undefined,children:[]},'').slice(0,remaining);
  if(piece){parts.push(piece);remaining-=piece.length+1;}
  if(node.each){
   const values=evaluate(node.each,scope);if(values===undefined)return;
   if(!Array.isArray(values)||values.length>100)throw Error('Invalid candidate composition collection');
   for(const value of values)for(const child of node.children??[])visit(child,{...scope,[node.as!]:value});
  } else for(const child of node.children??[])visit(child,scope);
 };
 for(const composition of [definition.composition,...Object.values(definition.packTreatments??{})])visit(composition.root,{attrs});
 return parts.join(' ');
}
