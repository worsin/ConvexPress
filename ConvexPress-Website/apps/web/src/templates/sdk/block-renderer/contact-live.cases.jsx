import { test, expect } from "bun:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { ConvexProvider } from "convex/react";
import { getFunctionName } from "convex/server";
import { ProductionFormEmbedProvider } from "./form-embed-production";
import { ContactFormBody } from "./contact-form";
import { parseContactDefinition } from "../block-data/portable/contactContracts";
import { demoFormResult } from "../../../../block-demo/form-adapter";
const attrs = parseContactDefinition({ heading: "Talk to the studio", submitLabel: "Send my note", fields: [{ name: "email", label: "Email", type: "email", required: true }, { name: "phone", label: "Telephone", type: "tel" }] });
const email = demoFormResult.form.fields.find(field => field.type === "email");
const form = { ...demoFormResult.form, fields: [email, { ...email, _id: "phone-id", name: "phone", key: "phone", type: "text", label: "Telephone", required: false, menuOrder: 1, settings: '{"inputType":"tel"}' }] };
async function inDom(run) {
 const dom = new JSDOM('<div id="root"></div>', { url: "https://example.test", pretendToBeVisual: true });
 const keys = ["window", "document", "HTMLElement", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT"];
 const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
 Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true });
 const { createRoot } = await import("react-dom/client");const root = createRoot(document.getElementById("root"));
 try { await run(root, dom); } finally { await act(async () => root.unmount()); dom.window.close(); Object.assign(globalThis, previous); }
}
test("Contact public host uses the installed client, saved labels, telephone controls and password/confirmation proof", async () => {
 const calls = [];let complete;
 const client = { url: "https://fixture.convex.cloud", mutation: async (fn, args) => { if (getFunctionName(fn) === "extensions/forms/analytics:recordFunnelPublic") return null; calls.push({ name: getFunctionName(fn), args }); return new Promise(resolve => { complete = resolve; }); },
  query: async (fn, args) => { calls.push({ name: getFunctionName(fn), args }); return { type: "message", renderedMessage: "<p>Your note arrived.</p>" }; } };
 const hosted = <ConvexProvider client={client}><ProductionFormEmbedProvider password="fixture-source-password"><ContactFormBody attrs={attrs} form={{ ...form, fields: form.fields.map(field => ({ ...field, defaultValue: field.type === "email" ? "visitor@example.invalid" : null })) }} /></ProductionFormEmbedProvider></ConvexProvider>;
 expect(renderToStaticMarkup(hosted)).toContain("Form preview");expect(calls).toHaveLength(0);
 await inDom(async root => {
  await act(async () => root.render(hosted));
  expect(document.querySelector('input[type="tel"]')).not.toBeNull();
  const button = [...document.querySelectorAll("button")].find(button => button.textContent === "Send my note");expect(button).toBeDefined();
  await act(async () => button.click());
  expect(button.disabled).toBe(true);expect(document.body.textContent).toContain("Submitting");expect(calls).toHaveLength(1);
  expect(calls[0].name).toBe("extensions/forms/mutations:submit");expect(calls[0].args.contactPassword).toBe("fixture-source-password");expect(calls[0].args.values).toContainEqual({ fieldKey: email.key, value: "visitor@example.invalid" });
  await act(async () => complete({ submissionId: "submission-id", isComplete: true, confirmationToken: "fixture-confirmation-proof" }));
  expect(calls[1].name).toBe("extensions/forms/confirmations:resolveConfirmation");expect(calls[1].args.confirmationToken).toBe("fixture-confirmation-proof");expect(calls[1].args.contactPassword).toBe("fixture-source-password");
  expect(document.body.textContent).toContain("Your note arrived.");expect(document.activeElement?.getAttribute("data-slot")).toBe("form-success");
 });
});
test("Contact required validation sends nothing and focuses the missing field",async()=>{
 const calls=[];const client={url:"https://fixture.convex.cloud",mutation:async(fn,args)=>{if(getFunctionName(fn)==="extensions/forms/analytics:recordFunnelPublic")return null;calls.push(args);throw Error("Unexpected submission");}};
 await inDom(async(root,dom)=>{
  await act(async()=>root.render(<ConvexProvider client={client}><ProductionFormEmbedProvider><ContactFormBody attrs={attrs} form={form}/></ProductionFormEmbedProvider></ConvexProvider>));
  await act(async()=>{[...document.querySelectorAll("button")].find(button=>button.textContent==="Send my note").click();await new Promise(resolve=>dom.window.setTimeout(resolve,30));});
  expect(calls).toHaveLength(0);expect(document.querySelector('[role="alert"]')).not.toBeNull();expect(document.activeElement?.getAttribute("type")).toBe("email");
 });
});
