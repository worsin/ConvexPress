import { getFunctionName } from "convex/server";
import * as membershipPolicyReads from "../../membership/policyReads";

/** In-memory DB adapter only: tests invoke the production registered handlers. */
export function commerceHarness(seed: Record<string, any[]> = {}, userId: string | null = "admin") {
  const tables: Record<string, any[]> = structuredClone({
    settings: [{ _id: "plugins", section: "plugins", values: { commerceEnabled: true, commerceSubscriptionsEnabled: true } }],
    users: [{ _id: "admin", authSource: "local", status: "active", roleId: "role", email: "admin@example.invalid" }],
    roles: [{ _id: "role", slug: "administrator", type: "internal", status: "active", capabilities: ["manage_options"] }],
    ...seed,
  });
  const calls: { name: string; args: any }[] = [];
  const handlers: Record<string, any> = {
    "membership/policyReads:rules": membershipPolicyReads.rules,
    "membership/policyReads:grants": membershipPolicyReads.grants,
    "membership/policyReads:measuredRules": membershipPolicyReads.measuredRules,
    "membership/policyReads:measuredGrants": membershipPolicyReads.measuredGrants,
  };
  const find = (id: string) => Object.values(tables).flat().find((row) => row._id === id) ?? null;
  function query(table: string) {
    const predicates: ((row: any) => boolean)[] = [];
    let descending = false;
    const index: any = {};
    for (const [operator, compare] of Object.entries({ eq: (a: any, b: any) => a === b, lt: (a: any, b: any) => a < b, lte: (a: any, b: any) => a <= b, gt: (a: any, b: any) => a > b, gte: (a: any, b: any) => a >= b })) {
      index[operator] = (field: string, value: any) => { predicates.push((row) => compare(row[field], value)); return index; };
    }
    const result = () => { const rows = (tables[table] ?? []).filter((row) => predicates.every((p) => p(row))); return structuredClone(descending ? rows.toReversed() : rows); };
    const builder: any = {
      withIndex(_name: string, callback?: any) { callback?.(index); return builder; },
      filter(callback: any) {
        const evaluate = (value: any, row: any): any => typeof value === "function" ? value(row) : value;
        const expr: any = { field: (key: string) => (row: any) => row[key] };
        for (const [name, compare] of Object.entries({ eq: (a: any, b: any) => a === b, neq: (a: any, b: any) => a !== b, lt: (a: any, b: any) => a < b, lte: (a: any, b: any) => a <= b, gt: (a: any, b: any) => a > b, gte: (a: any, b: any) => a >= b })) expr[name] = (a: any, b: any) => (row: any) => compare(evaluate(a, row), evaluate(b, row));
        expr.and = (...parts: any[]) => (row: any) => parts.every((part) => evaluate(part, row));
        expr.or = (...parts: any[]) => (row: any) => parts.some((part) => evaluate(part, row));
        predicates.push(callback(expr)); return builder;
      },
      order(direction: string) { descending = direction === "desc"; return builder; },
      collect: async () => result(), take: async (n: number) => result().slice(0, n),
      paginate: async ({ cursor, numItems }: { cursor: string | null; numItems: number }) => { const all = result(); const start = Number(cursor ?? 0); const end = start + numItems; return { page: all.slice(start, end), isDone: end >= all.length, continueCursor: String(end) }; },
      first: async () => result()[0] ?? null, unique: async () => result()[0] ?? null,
    };
    return builder;
  }
  const ctx: any = {
    tables, calls, handlers,
    auth: { getUserIdentity: async () => userId ? { subject: userId, tokenIdentifier: `https://convexpress-admin.local|${userId}` } : null },
    db: {
      query,
      get: async (...args: any[]) => structuredClone(find(args.at(-1))),
      normalizeId: (table: string, id: string) => table === "media" ? ((seed.media ?? []).some(row => row._id === id) || /^m[0-9]+$/.test(id) ? id : null) : id,
      insert: async (table: string, doc: any) => { tables[table] ??= []; const id = `${table}_${tables[table].length + 1}`; tables[table].push({ _id: id, _creationTime: Date.now(), ...structuredClone(doc) }); return id; },
      patch: async (...args: any[]) => { const row = find(args.at(-2)); if (!row) throw new Error(`Missing ${args.at(-2)}`); Object.assign(row, structuredClone(args.at(-1))); },
      delete: async (...args: any[]) => { const id = args.at(-1); for (const rows of Object.values(tables)) { const i = rows.findIndex((row) => row._id === id); if (i >= 0) rows.splice(i, 1); } },
    },
    scheduler: { runAfter: async (_delay: number, fn: any, args: any) => { calls.push({ name: getFunctionName(fn), args }); return "scheduled"; }, cancel: async () => {} },
  };
  for (const operation of ["runMutation", "runQuery", "runAction"]) ctx[operation] = async (fn: any, args: any) => { const name = getFunctionName(fn); calls.push({ name, args }); const handler = handlers[name]; return handler ? (handler._handler ?? handler)(ctx, args) : null; };
  return ctx;
}
