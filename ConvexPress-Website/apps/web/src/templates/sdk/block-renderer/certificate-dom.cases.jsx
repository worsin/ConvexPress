import { test, expect } from "bun:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { CertificateVerificationView } from "./certificate-verification";

test("certificate host revocation discards in-flight results and cannot unlock a later request", async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: "https://certificate.invalid", pretendToBeVisual: true });
  const names = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "MutationObserver", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("app"));
  const valid = { state: "valid", serial: "CERT-DEMO-2026", holderName: "Fictional learner", courseTitle: "Fictional course", certificateTitle: "Completion", issuedAt: 1, pdfUrl: null };
  const queued = [];
  const verify = () => new Promise(resolve => queued.push(resolve));
  const render = available => act(async () => root.render(<CertificateVerificationView title="Verify" available={available} verify={verify} />));
  const submit = async () => {
    const input = document.querySelector("input");
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, valid.serial);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await act(async () => document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  };
  try {
    await render(true);
    await submit();
    expect(queued).toHaveLength(1);
    await render(false);
    await render(true);
    expect(document.querySelector("button").disabled).toBe(false);
    await submit();
    expect(queued).toHaveLength(2);
    await act(async () => queued[0](valid));
    expect(document.querySelector(".cp-certificate-result")).toBeNull();
    expect(document.querySelector("button").disabled).toBe(true);
    await act(async () => queued[1](valid));
    expect(document.body.textContent).toContain("Fictional learner");
    await render(false);
    expect(document.body.textContent).not.toContain("Fictional learner");
    expect(document.querySelector("button").disabled).toBe(true);
  } finally {
    for (const resolve of queued) resolve({ state: "unavailable" });
    await act(async () => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});
