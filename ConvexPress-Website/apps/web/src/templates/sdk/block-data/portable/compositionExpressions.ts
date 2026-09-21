/** A small expression language, never JavaScript. Parsing consumes the whole
 * input; lookup only reads own data properties from the supplied scope. */
export type Expression =
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "path"; parts: string[] }
  | { kind: "concat"; items: Expression[] }
  | { kind: "format"; name: "currency" | "date" | "plural"; args: Expression[] };
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
export const safeCompositionName = (name: string) => /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(name) && !forbidden.has(name);

export function parseExpression(source: string, roots: ReadonlySet<string>): Expression {
  if (typeof source !== "string" || !source.length || source.length > 4000) throw Error("Expression must contain 1–4000 characters");
  let at = 0, nodes = 0;
  const whitespace = () => { while (/\s/.test(source[at] ?? "") && at < source.length) at++; };
  const fail = (): never => { throw Error(`Invalid composition expression at ${at}`); };
  function atom(depth: number): Expression {
    if (++nodes > 64 || depth > 8) throw Error("Expression complexity exceeds limit");
    whitespace();
    const quote = source[at];
    if (quote === "'" || quote === '"') {
      at++;
      let value = "", closed = false;
      while (at < source.length) {
        const char = source[at++];
        if (char === quote) { closed = true; break; }
        if (char === "\\") {
          const escaped = source[at++];
          if (!["\\", "'", '"', "n", "t"].includes(escaped)) fail();
          value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
        } else {
          if (char.charCodeAt(0) < 32) fail();
          value += char;
        }
      }
      if (!closed) fail();
      return { kind: "literal", value };
    }
    const numeric = /^-?(?:0|[1-9]\d*)(?:\.\d+)?/.exec(source.slice(at));
    if (numeric) { at += numeric[0].length; const value = Number(numeric[0]); if (!Number.isFinite(value)) fail(); return { kind: "literal", value }; }
    const identifier = /^[a-zA-Z][a-zA-Z0-9_]*/.exec(source.slice(at));
    if (!identifier) return fail();
    const name = identifier[0]; at += name.length; whitespace();
    if (["true", "false", "null"].includes(name)) return { kind: "literal", value: name === "null" ? null : name === "true" };
    if (source[at] === "(") {
      if (!["currency", "date", "plural"].includes(name)) fail();
      at++;
      const args: Expression[] = [];
      whitespace();
      if (source[at] !== ")") {
        while (true) {
          if (args.length >= 3) fail();
          args.push(expression(depth + 1)); whitespace();
          if (source[at] !== ",") break;
          at++;
        }
      }
      if (source[at++] !== ")") fail();
      if ((name === "currency" && args.length !== 2) || (name === "date" && args.length !== 1) || (name === "plural" && args.length !== 3)) fail();
      return { kind: "format", name: name as "currency" | "date" | "plural", args };
    }
    if (!roots.has(name) || forbidden.has(name)) fail();
    const parts = [name];
    while (source[at] === ".") {
      at++;
      const part = /^(?:[a-zA-Z_][a-zA-Z0-9_]*|0|[1-9]\d*)/.exec(source.slice(at));
      if (!part) return fail();
      if (forbidden.has(part[0]) || part[0].length > 80 || parts.length >= 16) fail();
      parts.push(part[0]); at += part[0].length;
    }
    return { kind: "path", parts };
  }
  function expression(depth: number): Expression {
    const items = [atom(depth)]; whitespace();
    while (source[at] === "+") {
      if (items.length >= 16) fail();
      at++; items.push(atom(depth)); whitespace();
    }
    return items.length === 1 ? items[0] : { kind: "concat", items };
  }
  const result = expression(0); whitespace();
  if (at !== source.length) fail();
  return result;
}

const scalarText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw Error("Text expressions require a string or finite number");
};
export function evaluateExpression(expression: Expression, scope: Readonly<Record<string, unknown>>): unknown {
  switch (expression.kind) {
    case "literal": return expression.value;
    case "path": {
      let value: unknown = scope;
      for (const part of expression.parts) {
        if (!value || typeof value !== "object" || forbidden.has(part)) throw Error(`Unavailable expression path: ${expression.parts.join(".")}`);
        const field = Object.getOwnPropertyDescriptor(value, part);
        if (!field || !("value" in field)) throw Error(`Unavailable expression path: ${expression.parts.join(".")}`);
        value = field.value;
      }
      return value;
    }
    case "concat": {
      const result = expression.items.map(item => scalarText(evaluateExpression(item, scope))).join("");
      if (result.length > 20000) throw Error("Expression text exceeds limit");
      return result;
    }
    case "format": {
      const args = expression.args.map(item => evaluateExpression(item, scope));
      if (expression.name === "currency") {
        const [amount, currency] = args;
        if (!Number.isSafeInteger(amount) || Math.abs(amount as number) > 1e12 || typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) throw Error("currency requires bounded integer minor units and an ISO currency code");
        const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
        const digits = formatter.resolvedOptions().maximumFractionDigits;
        if (digits === undefined) throw Error("Currency precision is unavailable");
        return formatter.format((amount as number) / 10 ** digits);
      }
      if (expression.name === "plural") {
        const [count, singular, plural] = args;
        if (!Number.isSafeInteger(count) || (count as number) < 0 || typeof singular !== "string" || typeof plural !== "string" || singular.length > 240 || plural.length > 240) throw Error("plural requires a nonnegative integer and two bounded labels");
        return `${count} ${count === 1 ? singular : plural}`;
      }
      const value = args[0];
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value)) throw Error("date requires an ISO date or UTC timestamp");
      const parsed = new Date(value);
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value.slice(0, 10)) throw Error("Invalid composition date");
      return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(parsed);
    }
  }
}

/** JSON ingress guard runs before recursive schema/AST work and never executes
 * user getters or toJSON methods. It also bounds arrays that emit no UI nodes. */
export function copyCompositionJson(value: unknown): unknown {
  let count = 0, bytes = 0;
  const active = new Set<object>(), encoder = new TextEncoder();
  const charge = (text: string) => { bytes += encoder.encode(text).byteLength; if (bytes > 512 * 1024) throw Error("Composition payload exceeds 512KiB"); };
  function copy(input: unknown, depth: number): unknown {
    if (++count > 20000 || depth > 32) throw Error("Composition JSON complexity exceeds limit");
    if (input === null || typeof input === "boolean") return input;
    if (typeof input === "string") { charge(input); return input; }
    if (typeof input === "number" && Number.isFinite(input)) return input;
    if (!input || typeof input !== "object") throw Error("Composition input must be JSON data");
    if (active.has(input)) throw Error("Composition input cannot contain cycles");
    const array = Array.isArray(input), proto = Object.getPrototypeOf(input);
    if (!array && proto !== Object.prototype && proto !== null) throw Error("Composition objects must contain plain data");
    active.add(input);
    let result: unknown;
    if (array) {
      if (input.length > 1000 || Reflect.ownKeys(input).length !== input.length + 1) throw Error("Invalid or oversized composition array");
      result = Array.from({ length: input.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
        if (!descriptor || !("value" in descriptor)) throw Error("Composition arrays require own data entries");
        return copy(descriptor.value, depth + 1);
      });
    } else {
      const out: Record<string, unknown> = {};
      for (const key of Reflect.ownKeys(input)) {
        if (typeof key !== "string" || forbidden.has(key)) throw Error("Unsafe composition data key");
        charge(key);
        const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
        if (!("value" in descriptor) || !descriptor.enumerable) throw Error("Composition objects require enumerable data fields");
        out[key] = copy(descriptor.value, depth + 1);
      }
      result = out;
    }
    active.delete(input);
    return result;
  }
  const result = copy(value, 0);
  if (encoder.encode(JSON.stringify(result)).byteLength > 512 * 1024) throw Error("Composition payload exceeds 512KiB");
  return result;
}
