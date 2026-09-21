import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act } from "react";
import { AdminShellErrorBoundary } from "./AdminShellErrorBoundary";
import { AdminContentErrorBoundary } from "./AdminContentErrorBoundary";

const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");

test("permission-capacity recovery replaces stale content and retries after repair", async () => {
  const dom = new JSDOM('<div id="app"></div>', { url:"http://localhost", pretendToBeVisual:true });
  const names = ["window", "document", "navigator", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis,name)] as const);
  for (const name of names) Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name]});
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("app")!);
  const originalError = console.error;
  console.error = () => {};
  try {
    let caseId = 0;
    for (const Boundary of [AdminShellErrorBoundary, AdminContentErrorBoundary]) {
      for (const data of [
        {code:"CONTROL_PLANE_AUTHORIZATION_CAPACITY"},
        {code:"CONTROL_PLANE_OPERATION_FAILED",message:"Authorization rule limit exceeded; narrow the operator's grants or permission catalog"},
      ]) {
        const error = Object.assign(new Error("Opaque server failure"), {data});
        let failed = false;
        const ProtectedContent = () => { if(failed) throw error; return <div>Authorized portfolio</div>; };
        const key = String(++caseId);
        const render = () => act(async () => root.render(<Boundary key={key}><ProtectedContent /></Boundary>));
        await render();
        expect(document.body.textContent).toContain("Authorized portfolio");
        failed = true;
        await render();
        expect(document.body.textContent).toContain("Permission limit reached");
        expect(document.body.textContent).toContain("reduce or consolidate");
        expect(document.body.textContent).not.toContain("Authorized portfolio");
        expect(document.body.textContent).not.toContain("Opaque server failure");
        failed = false;
        const retry = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Try Again"))!;
        await act(async () => retry.click());
        expect(document.body.textContent).toContain("Authorized portfolio");
        expect(document.body.textContent).not.toContain("Permission limit reached");
      }
    }
  } finally {
    await act(async () => root.unmount());
    console.error = originalError;
    dom.window.close();
    for (const [name,descriptor] of previous) {
      if(descriptor) Object.defineProperty(globalThis,name,descriptor);
      else Reflect.deleteProperty(globalThis,name);
    }
  }
});
