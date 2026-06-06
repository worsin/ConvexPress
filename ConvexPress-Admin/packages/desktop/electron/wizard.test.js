const { describe, expect, test } = require("bun:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const wizardSource = fs.readFileSync(
  path.join(__dirname, "wizard", "wizard.js"),
  "utf8",
);

function createClassList() {
  const classes = new Set();
  return {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    toggle: (name, force) => {
      if (force === undefined ? !classes.has(name) : force) {
        classes.add(name);
        return true;
      }
      classes.delete(name);
      return false;
    },
    contains: (name) => classes.has(name),
  };
}

function createElement(id) {
  return {
    id,
    value: "",
    textContent: "",
    innerHTML: "",
    className: "",
    classList: createClassList(),
    listeners: {},
    addEventListener(event, handler) {
      this.listeners[event] = handler;
    },
  };
}

async function runWizardScenario(scenario) {
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) {
      elements.set(id, createElement(id));
    }
    return elements.get(id);
  };
  const context = {
    console,
    setTimeout() {},
    document: {
      getElementById: getElement,
      querySelectorAll: () => [
        getElement("dot-1"),
        getElement("dot-2"),
        getElement("dot-3"),
        getElement("dot-4"),
        getElement("dot-5"),
      ],
    },
    window: {
      convexpressSetup: {
        testConnection: async () => ({ ok: true }),
        saveConfig: async () => ({ success: true }),
        launchApp: async () => undefined,
        quit: async () => undefined,
      },
      close() {},
    },
  };

  vm.runInNewContext(
    `${wizardSource}\nresultPromise = (async () => {\n${scenario}\n})();`,
    context,
    { filename: "wizard.js" },
  );
  return await context.resultPromise;
}

describe("setup wizard connection tests", () => {
  test("ignores stale connection success after the URL changes", async () => {
    const result = await runWizardScenario(`
      const pending = [];
      const calls = [];
      window.convexpressSetup.testConnection = (url) => {
        calls.push(url);
        return new Promise((resolve) => pending.push({ url, resolve }));
      };

      state.convexUrl = "https://old-deploy.convex.cloud";
      const oldRun = startConnectionTest("server");
      state.convexUrl = "https://new-deploy.convex.cloud";
      const newRun = startConnectionTest("server");

      pending[0].resolve({ ok: true });
      await oldRun;

      const staleResult = {
        calls,
        actionsHiddenAfterStale: $("server-test-actions").classList.contains("hidden"),
        statusAfterStale: $("server-test-status").innerHTML,
      };

      pending[1].resolve({ ok: false, error: "New deployment failed" });
      await newRun;

      return {
        ...staleResult,
        finalStatus: $("server-test-status").innerHTML,
        nextHidden: $("btn-server-test-next").classList.contains("hidden"),
      };
    `);

    expect(result.calls).toEqual([
      "https://old-deploy.convex.cloud",
      "https://new-deploy.convex.cloud",
    ]);
    expect(result.actionsHiddenAfterStale).toBe(true);
    expect(result.statusAfterStale).toContain("Connecting to your Convex deployment");
    expect(result.finalStatus).toContain("New deployment failed");
    expect(result.nextHidden).toBe(true);
  });

  test("shows the next action for the current successful connection test", async () => {
    const result = await runWizardScenario(`
      window.convexpressSetup.testConnection = async (url) => ({ ok: true, url });
      state.convexUrl = "https://current-deploy.convex.cloud";
      await startConnectionTest("client");
      return {
        status: $("client-test-status").innerHTML,
        actionsHidden: $("client-test-actions").classList.contains("hidden"),
        nextHidden: $("btn-client-test-next").classList.contains("hidden"),
      };
    `);

    expect(result.status).toContain("Connection successful");
    expect(result.actionsHidden).toBe(false);
    expect(result.nextHidden).toBe(false);
  });
});
