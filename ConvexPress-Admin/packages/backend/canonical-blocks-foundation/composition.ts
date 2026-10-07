import { primitiveSchemas, validatePrimitiveProps, type PrimitiveName } from "./primitiveContracts";
import { copyCompositionJson, parseExpression, evaluateExpression, safeCompositionName, type Expression } from "./compositionExpressions";

export interface CompositionNode {
  el: PrimitiveName;
  props?: Record<string, unknown>;
  bind?: string | Record<string, string>;
  if?: string;
  each?: string;
  as?: string;
  children?: CompositionNode[];
}
export interface Composition { version: 1; root: CompositionNode }
export interface ResolvedCompositionNode {
  el: PrimitiveName;
  props: Record<string, unknown>;
  children: ResolvedCompositionNode[];
  text?: string;
}
interface CompiledNode {
  node: CompositionNode;
  text?: Expression;
  bindings: Record<string, Expression>;
  condition?: Expression;
  collection?: Expression;
  children: CompiledNode[];
}
const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
const containers = new Set(["Section", "Container", "Stack", "Grid", "Columns", "Split", "Card"]);
const textElements = new Set(["Heading", "Eyebrow", "Text"]);
const nodeKeys = new Set(["el", "props", "bind", "if", "each", "as", "children"]);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export class CompositionError extends Error {
  constructor(public readonly path: string, message: string) { super(`${path}: ${message}`); this.name = "CompositionError"; }
}
function compile(input: unknown): { definition: Composition; root: CompiledNode } {
  const source = copyCompositionJson(input);
  if (!record(source) || source.version !== 1 || Object.keys(source).some(key => !["version", "root"].includes(key))) throw new CompositionError("composition", "Expected version1 and a primitive root");
  let count = 0;
  function visit(value: unknown, roots: ReadonlySet<string>, depth: number, at: string): CompiledNode {
    try {
      if (depth > 8 || ++count > 300) throw Error("Composition exceeds depth8 or300 nodes");
      if (!record(value) || Object.keys(value).some(key => !nodeKeys.has(key))) throw Error("Unknown composition node fields");
      if (typeof value.el !== "string" || !hasOwn(primitiveSchemas, value.el)) throw Error("Unknown SDK primitive");
      const el = value.el as PrimitiveName, schema = primitiveSchemas[el];
      const props = value.props === undefined ? {} : value.props;
      if (!record(props) || hasOwn(props, "blockId")) throw Error("Props must be a primitive data object; blockId is host-owned");
      const parsedProps = schema.partial().parse(props);
      const bindings: Record<string, Expression> = {};
      let text: Expression | undefined;
      if (typeof value.bind === "string") {
        if (!textElements.has(el)) throw Error("Text binding is supported only by Heading, Eyebrow and Text");
        text = parseExpression(value.bind, roots);
      } else if (value.bind !== undefined) {
        if (!record(value.bind) || Object.keys(value.bind).length > 32) throw Error("Invalid prop bindings");
        for (const [key, expr] of Object.entries(value.bind)) {
          if (key === "blockId" || !hasOwn(schema.shape, key) || hasOwn(props, key)) throw Error(`Unknown, host-owned or duplicate bound prop: ${key}`);
          if (typeof expr !== "string") throw Error("Bindings must contain expression strings");
          bindings[key] = parseExpression(expr, roots);
        }
      }
      if (!Object.keys(bindings).length) validatePrimitiveProps(el, parsedProps);
      for (const [key, field] of Object.entries(schema.shape))
        if (!field.isOptional() && !hasOwn(parsedProps, key) && !hasOwn(bindings, key)) throw Error(`Missing required prop: ${key}`);
      if (textElements.has(el) && !text) throw Error("Text primitive requires a text binding");
      let condition: Expression | undefined, collection: Expression | undefined;
      if (value.if !== undefined) {
        if (typeof value.if !== "string") throw Error("if must be an expression string");
        condition = parseExpression(value.if, roots);
      }
      const childRoots = new Set(roots);
      if (value.each !== undefined || value.as !== undefined) {
        if (!containers.has(el) || typeof value.each !== "string" || typeof value.as !== "string" || !safeCompositionName(value.as) || roots.has(value.as) || ["true", "false", "null", "currency", "date", "plural"].includes(value.as)) throw Error("each requires a container, a collection path and a distinct alias");
        collection = parseExpression(value.each, roots);
        if (collection.kind !== "path") throw Error("each must be a data path");
        childRoots.add(value.as);
      }
      if (value.children !== undefined && (!containers.has(el) || !Array.isArray(value.children))) throw Error("Only containers accept child nodes");
      const children = ((value.children ?? []) as unknown[]).map((child, index) => visit(child, childRoots, depth + 1, `${at}.children[${index}]`));
      if (collection && !children.length) throw Error("each requires children");
      return { node: { ...value, props: parsedProps } as unknown as CompositionNode, text, bindings, condition, collection, children };
    } catch (error) {
      if (error instanceof CompositionError) throw error;
      throw new CompositionError(at, error instanceof Error ? error.message : "Invalid composition");
    }
  }
  return { definition: source as unknown as Composition, root: visit(source.root, new Set(["attrs", "data"]), 1, "root") };
}
export function validateComposition(input: unknown): Composition { return compile(input).definition; }

/** Caller must supply attrs validated against the definition and data from an
 * authorized resolver. This pure evaluator grants no access and performs no IO. */
export function resolveComposition(input: unknown, inputScope: { attrs: unknown; data?: unknown }, options: { allowedSlots?: readonly string[]; omitDataDependentNodes?: boolean } = {}): ResolvedCompositionNode | null {
  const compiled = compile(input);
  const scope = copyCompositionJson({ attrs: inputScope.attrs, data: inputScope.data ?? null }) as Record<string, unknown>;
  const anchors = new Set<string>();
  const allowedSlots = new Set(options.allowedSlots ?? []);
  let nodes = 0, work = 0, outputBytes = 0;
  const encoder = new TextEncoder();
  function dependsOnData(expression: Expression | undefined): boolean {
    if (!expression) return false;
    if (expression.kind === "path") return expression.parts[0] === "data";
    if (expression.kind === "concat") return expression.items.some(dependsOnData);
    if (expression.kind === "format") return expression.args.some(dependsOnData);
    return false;
  }
  function visit(item: CompiledNode, context: Record<string, unknown>, at: string): ResolvedCompositionNode | null {
    try {
      if (++work > 5000) throw Error("Composition evaluation work limit exceeded");
      // Internal search projection only: never invent an empty resolver result.
      // A data-dependent container prunes its descendants and loop aliases;
      // independent authored siblings continue through the ordinary evaluator.
      if (options.omitDataDependentNodes && [item.condition, item.collection, item.text, ...Object.values(item.bindings)].some(dependsOnData)) return null;
      if (item.condition) {
        const condition = evaluateExpression(item.condition, context);
        if (typeof condition !== "boolean") throw Error("if requires a boolean");
        if (!condition) return null;
      }
      if (++nodes > 300) throw Error("Expanded composition exceeds300 nodes");
      const props = { ...item.node.props };
      for (const [key, expression] of Object.entries(item.bindings)) props[key] = evaluateExpression(expression, context);
      const valid = validatePrimitiveProps(item.node.el, props) as Record<string, unknown>;
      if (item.node.el === "Slot" && !allowedSlots.has(valid.name as string)) throw Error("Composition slot is not exposed by this host");
      if (typeof valid.anchor === "string") {
        if (anchors.has(valid.anchor)) throw Error("Composition anchors must be unique");
        anchors.add(valid.anchor);
      }
      let text: string | undefined;
      if (item.text) {
        const value = evaluateExpression(item.text, context);
        if (typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value))) throw Error("Text binding must resolve to a string or finite number");
        text = String(value);
        if (text.length > 20000) throw Error("Composition text exceeds limit");
      }
      outputBytes += encoder.encode(JSON.stringify(valid)).byteLength + encoder.encode(text ?? "").byteLength;
      if (outputBytes > 512 * 1024) throw Error("Expanded composition exceeds512KiB");
      const children: ResolvedCompositionNode[] = [];
      function append(childContext: Record<string, unknown>, iteration: string) {
        for (const [index, child] of item.children.entries()) {
          const result = visit(child, childContext, `${at}${iteration}.children[${index}]`);
          if (result) children.push(result);
        }
      }
      if (item.collection) {
        const collection = evaluateExpression(item.collection, context);
        if (!Array.isArray(collection) || collection.length > 100) throw Error("each requires an array with at most100 entries");
        for (const [index, value] of collection.entries()) append({ ...context, [item.node.as!]: value }, `.each[${index}]`);
      } else append(context, "");
      return { el: item.node.el, props: valid, children, ...(text === undefined ? {} : { text }) };
    } catch (error) {
      if (error instanceof CompositionError) throw error;
      throw new CompositionError(at, error instanceof Error ? error.message : "Invalid composition value");
    }
  }
  const result = visit(compiled.root, scope, "root");
  if (encoder.encode(JSON.stringify(result)).byteLength > 512 * 1024) throw new CompositionError("root", "Expanded composition exceeds512KiB");
  return result;
}
