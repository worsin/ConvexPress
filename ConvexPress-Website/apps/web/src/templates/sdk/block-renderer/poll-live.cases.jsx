import { pollDefaultSecurity } from "../block-data/portable/pollDataContracts";
import { test, expect } from "bun:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { ConvexProvider } from "convex/react";
import { getFunctionName } from "convex/server";
import { ProductionPollProvider, PollDraftScope } from "./poll-production";
import { PollBody } from "./poll";
import { parsePollDefinition, pollDefinitionVersion } from "../block-data/portable/pollContracts";
import { pollStorageKey } from "./poll-client";
const attrs = parsePollDefinition({ question: "What shall we explore?", options: [{ key: "walk", label: "A walk" }, { key: "book", label: "A book" }] });
const initial = { security: pollDefaultSecurity, postId: "page", blockId: "poll", definitionVersion: pollDefinitionVersion(attrs), question: attrs.question, options: attrs.options.map(option => ({ ...option, count: 0 })), total: 0, responsePolicy: "visitor", canVote: true, votedKey: null, asOf: Date.now(), nextChangeAt: null };
async function inDom(run) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://example.test", pretendToBeVisual: true });
  Object.defineProperty(dom.window.navigator, "locks", { value: { request: async (_key, callback) => callback() } });
  const keys = ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client"); const root = createRoot(document.getElementById("root"));
  try { await run(root, dom); } finally { await act(async () => root.unmount()); dom.window.close(); Object.assign(globalThis, previous); }
}
function fixture() {
  const queries = [], mutations = [], actions = []; let result = { ...initial, asOf: Date.now() }, finish, fail;
  const client = { url: "https://fixture.convex.cloud", watchQuery(fn, args) {
    const item = { name: getFunctionName(fn), args, stopped: false, update: () => {} }; queries.push(item);
    return { localQueryResult: () => result, onUpdate(callback) { item.update = callback; return () => { item.stopped = true; }; } };
  }, mutation(fn, args) { mutations.push({ name: getFunctionName(fn), args }); return new Promise((resolve, reject) => { finish = resolve; fail = reject; }); },
  action(fn, args) { actions.push({ name: getFunctionName(fn), args }); return new Promise((resolve, reject) => { finish = resolve; fail = reject; }); } };
  const view = ({ generation = "session-one", signedIn = false, installationKey = "site:staging" } = {}) => <ConvexProvider client={client}><ProductionPollProvider installationKey={installationKey} generation={generation} signedIn={signedIn} password="page-proof"><PollBody attrs={attrs} data={{ blockId: "poll", poll: initial, asOf: initial.asOf, nextChangeAt: null }} /></ProductionPollProvider></ConvexProvider>;
  return { client, queries, mutations, actions, view, set: value => { result = value; }, finish: value => finish(value), fail: (error = new Error("Synthetic network failure")) => fail(error) };
}
test("live poll uses installed client and explicit stored identity; SSR is inert and confirmed totals remain server-owned", async () => {
  const f = fixture(); expect(renderToStaticMarkup(f.view())).toContain("Poll preview"); expect(f.queries).toHaveLength(0);
  await inDom(async root => {
    await act(async () => root.render(f.view()));
    expect(window.localStorage.length).toBe(0); expect(f.mutations).toHaveLength(0);
    expect(f.queries[0].args.password).toBe("page-proof"); expect(f.queries[0].args.visitorToken).toBeUndefined();
    await act(async () => { document.querySelector('input[value="walk"]').click(); });
    await act(async () => document.querySelector('button[type="submit"]').click());
    expect(f.mutations).toHaveLength(1); expect(f.mutations[0].name).toBe("extensions/forms/polls:vote");
    const token = f.mutations[0].args.visitorToken; expect(token).toMatch(/^[a-f0-9]{64}$/);
    const key = pollStorageKey(`${f.client.url}:site:staging`, initial); expect(window.localStorage.getItem(key)).toBe(token);
    expect(f.mutations[0].args).toMatchObject({ postId: "page", blockId: "poll", definitionVersion: initial.definitionVersion, optionKey: "walk", password: "page-proof" });
    expect(document.body.textContent).toContain("0 responses"); expect(document.querySelector('button[type="submit"]').disabled).toBe(true);
    f.set({ ...initial, asOf: Date.now(), canVote: false, votedKey: "walk", total: 1, options: initial.options.map(option => ({ ...option, count: option.key === "walk" ? 1 : 0 })) });
    await act(async () => f.finish({ accepted: true, optionKey: "walk" }));
    expect(f.queries.at(-1).args.visitorToken).toBe(token); expect(f.queries[0].stopped).toBe(true);
    expect(document.body.textContent).toContain("1 response"); expect(document.body.textContent).toContain("Thank you"); expect(document.activeElement?.getAttribute("role")).toBe("status");
  });
});
test("signed-in votes require no browser storage and generation changes discard old pending completions", async () => {
  const f = fixture();
  await inDom(async root => {
    Object.defineProperty(window, "localStorage", { get() { throw Error("Storage blocked"); } });
    await act(async () => root.render(f.view({ signedIn: true })));
    await act(async () => document.querySelector('input[value="book"]').click());
    await act(async () => document.querySelector('button[type="submit"]').click());
    expect(f.mutations[0].args.visitorToken).toBeUndefined();
    await act(async () => root.render(f.view({ generation: "session-two", signedIn: true })));
    expect(f.queries[0].stopped).toBe(true);
    await act(async () => f.finish({ accepted: true, optionKey: "book" }));
    expect(document.body.textContent).not.toContain("Thank you"); expect(document.body.textContent).not.toContain("Response recorded");
    await act(async () => f.queries[0].update()); expect(document.body.textContent).toContain("Send my response");
  });
});
test("expired live poll is cleared and a fresh nonce subscription refuses unavailable results", async () => {
  const f = fixture(); f.set({ ...initial, asOf: 500000, nextChangeAt: 500020 });
  await inDom(async root => {
    await act(async () => root.render(f.view()));
    expect(document.querySelector('input[type="radio"]')).not.toBeNull();
    f.set(null);
    await act(async () => new Promise(resolve => setTimeout(resolve, 35)));
    expect(f.queries).toHaveLength(2); expect(f.queries[0].stopped).toBe(true);
    expect(f.queries[1].args.refreshKey).not.toBe(f.queries[0].args.refreshKey);
    expect(document.body.textContent).toContain("not currently available"); expect(document.querySelector('input[type="radio"]')).toBeNull();
  });
});
test("failed requests retry the persisted identity, and blocked guest storage refuses before a mutation", async () => {
  const f = fixture();
  await inDom(async root => {
    await act(async () => root.render(f.view()));
    await act(async () => document.querySelector('input[value="walk"]').click());
    await act(async () => document.querySelector('button[type="submit"]').click());
    const token = f.mutations[0].args.visitorToken;
    await act(async () => f.fail());
    expect(document.activeElement?.getAttribute("role")).toBe("alert"); expect(document.body.textContent).toContain("could not be saved");
    await act(async () => document.querySelector('button[type="submit"]').click());
    expect(f.mutations).toHaveLength(2); expect(f.mutations[1].args.visitorToken).toBe(token);
    await act(async () => f.fail());
    Object.defineProperty(window, "localStorage", { get() { throw Error("Blocked"); } });
    await act(async () => root.render(f.view({ generation: "another-guest", installationKey: "other:staging" })));
    await act(async () => document.querySelector('input[value="book"]').click());
    await act(async () => document.querySelector('button[type="submit"]').click());
    expect(f.mutations).toHaveLength(2); expect(document.body.textContent).toContain("Allow browser storage"); expect(document.activeElement?.getAttribute("role")).toBe("alert");
  });
});
test("live CAPTCHA requires a token, uses the verification action, survives tally updates and rejects disposed-widget callbacks", async () => {
  const f = fixture(), widgets = [], removed = [];
  const secured = { ...initial, asOf: Date.now(), security: { ...pollDefaultSecurity, captchaEnabled: true, captchaProvider: "turnstile", captchaSiteKey: "synthetic-site-key" } }; f.set(secured);
  await inDom(async (root, dom) => {
    window.turnstile = { render(_node, options) { widgets.push(options); return widgets.length; }, remove(id) { removed.push(id); } };
    await act(async () => root.render(f.view()));
    await act(async () => document.querySelector('script[src*="turnstile"]')?.dispatchEvent(new dom.window.Event("load")));
    expect(widgets).toHaveLength(1);
    await act(async () => document.querySelector('input[value="walk"]').click());
    await act(async () => document.querySelector('button[type="submit"]').click());
    expect(f.actions).toHaveLength(0); expect(f.mutations).toHaveLength(0); expect(document.body.textContent).toContain("Complete the verification");
    await act(async () => widgets[0].callback("first-provider-proof"));
    f.set({ ...secured, total: 1, options: secured.options.map(option => ({ ...option, count: option.key === "book" ? 1 : 0 })) });
    await act(async () => f.queries.at(-1).update()); expect(widgets).toHaveLength(1);
    await act(async () => document.querySelector('button[type="submit"]').click());
    expect(f.actions).toHaveLength(1); expect(f.actions[0].name).toBe("extensions/forms/polls:voteWithVerification"); expect(f.actions[0].args.captchaToken).toBe("first-provider-proof"); expect(f.mutations).toHaveLength(0);
    await act(async () => f.fail()); expect(widgets).toHaveLength(2); expect(removed).toContain(1);
    await act(async () => widgets[0].callback("stale-provider-proof"));
    await act(async () => document.querySelector('button[type="submit"]').click()); expect(f.actions).toHaveLength(1);
    await act(async () => widgets[1].callback("second-provider-proof"));
    await act(async () => document.querySelector('button[type="submit"]').click()); expect(f.actions).toHaveLength(2); expect(f.actions[1].args.captchaToken).toBe("second-provider-proof");
    await act(async () => f.fail());
  });
});

test("narrow CAPTCHA uses the provider compact layout and discards old tokens after resizing", async () => {
  const f = fixture(), widgets = [], observers = []; let width = 230;
  f.set({ ...initial, asOf: Date.now(), security: { ...pollDefaultSecurity, captchaEnabled: true, captchaProvider: "turnstile", captchaSiteKey: "synthetic-site-key" } });
  await inDom(async (root, dom) => {
    const original = dom.window.HTMLElement.prototype.getBoundingClientRect;
    dom.window.HTMLElement.prototype.getBoundingClientRect = function () { return this.dataset.slot === "forms-captcha" ? { width } : original.call(this); };
    window.ResizeObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } };
    window.turnstile = { render(_node, options) { widgets.push(options); return widgets.length; }, remove() {} };
    await act(async () => root.render(f.view()));
    await act(async () => document.querySelector('script[src*="turnstile"]')?.dispatchEvent(new dom.window.Event("load")));
    expect(widgets.at(-1).size).toBe("compact");
    const compact = widgets.at(-1);
    await act(async () => compact.callback("compact-proof"));
    width = 450;
    await act(async () => observers.at(-1).callback());
    expect(widgets.at(-1).size).toBe("normal");
    await act(async () => compact.callback("disposed-proof"));
    await act(async () => document.querySelector('input[value="walk"]').click());
    await act(async () => document.querySelector('button[type="submit"]').click());
    expect(f.actions).toHaveLength(0);
    await act(async () => widgets.at(-1).callback("wide-proof"));
    await act(async () => document.querySelector('button[type="submit"]').click());
    expect(f.actions[0].args.captchaToken).toBe("wide-proof");
    await act(async () => f.fail({ data: { code: "POLL_VERIFICATION_REQUIRED", message: "Private provider details" } }));
    expect(document.body.textContent).toContain("Complete the new challenge");
    expect(document.body.textContent).not.toContain("Private provider details");
    await act(async () => root.render(null));
    expect(observers.every(observer => observer.disconnected)).toBe(true);
  });
});

test("unsent choice survives cleared authorization content only within the same page session", async () => {
  const f = fixture();
  await inDom(async root => {
    const show = (visible, session = "first") => <PollDraftScope key={session}>{visible ? f.view({ generation: session }) : <p role="status">Refreshing access</p>}</PollDraftScope>;
    await act(async () => root.render(show(true)));
    await act(async () => document.querySelector('input[value="book"]').click());
    f.set(null);
    await act(async () => f.queries.at(-1).update());
    expect(document.querySelector('input[type="radio"]')).toBeNull();
    f.set({ ...initial, asOf: Date.now() });
    await act(async () => f.queries.at(-1).update());
    expect(document.querySelector('input[value="book"]').checked).toBe(true);
    await act(async () => root.render(show(false)));
    expect(document.body.textContent).not.toContain(attrs.question);
    expect(document.querySelector('input[type="radio"]')).toBeNull();
    await act(async () => root.render(show(true)));
    expect(document.querySelector('input[value="book"]').checked).toBe(true);
    expect(f.mutations).toHaveLength(0);
    expect(window.localStorage.length).toBe(0);
    await act(async () => root.render(show(true, "different-account")));
    expect(document.querySelector('input[value="book"]').checked).toBe(false);
  });
});
