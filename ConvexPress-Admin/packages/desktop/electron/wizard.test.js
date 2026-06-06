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
  const timers = [];
  const getElement = (id) => {
    if (!elements.has(id)) {
      elements.set(id, createElement(id));
    }
    return elements.get(id);
  };
  const context = {
    console,
    setTimeout(handler) {
      timers.push(handler);
      return timers.length;
    },
    async flushTimers() {
      while (timers.length) {
        await timers.shift()();
      }
    },
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

      showStep("server-test");
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
      showStep("client-test");
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

  test("ignores a pending connection success after backing out of the test step", async () => {
    const result = await runWizardScenario(`
      const pending = [];
      window.convexpressSetup.testConnection = (url) =>
        new Promise((resolve) => pending.push({ url, resolve }));

      state.convexUrl = "https://current-deploy.convex.cloud";
      showStep("server-test");
      const run = startConnectionTest("server");

      $("btn-server-test-back").listeners.click();
      pending[0].resolve({ ok: true });
      await run;

      return {
        currentStep: state.currentStep,
        actionsHidden: $("server-test-actions").classList.contains("hidden"),
        nextHidden: $("btn-server-test-next").classList.contains("hidden"),
        status: $("server-test-status").innerHTML,
      };
    `);

    expect(result.currentStep).toBe("server-config");
    expect(result.actionsHidden).toBe(true);
    expect(result.nextHidden).toBe(false);
    expect(result.status).toContain("Connecting to your Convex deployment");
  });

  test("server setup saves first-admin credentials then launches app for automatic sign-in", async () => {
    const result = await runWizardScenario(`
      const saveCalls = [];
      const launchCalls = [];
      window.convexpressSetup.saveConfig = async (options) => {
        saveCalls.push(options);
        return { success: true };
      };
      window.convexpressSetup.launchApp = async () => {
        launchCalls.push("launch");
      };

      state.mode = "server";
      state.convexUrl = "https://fresh-site-123.convex.cloud";
      state.deployKey = "prod:fresh-site-123|deploy-token";
      state.adminName = "First Admin";
      state.adminEmail = "admin@example.com";
      state.adminPassword = "CorrectHorseBatteryStaple42!";
      $("input-deploy-key").value = state.deployKey;
      $("input-admin-name").value = state.adminName;
      $("input-admin-email").value = state.adminEmail;
      $("input-admin-password").value = state.adminPassword;
      $("input-admin-confirm").value = state.adminPassword;

      await completeSetup();
      await flushTimers();

      return {
        saveCalls,
        launchCalls,
        currentStep: state.currentStep,
        completeMessage: $("complete-message").textContent,
        clearedState: {
          deployKey: state.deployKey,
          adminName: state.adminName,
          adminEmail: state.adminEmail,
          adminPassword: state.adminPassword,
        },
        clearedInputs: {
          deployKey: $("input-deploy-key").value,
          adminName: $("input-admin-name").value,
          adminEmail: $("input-admin-email").value,
          adminPassword: $("input-admin-password").value,
          adminConfirm: $("input-admin-confirm").value,
        },
      };
    `);

    expect(result.saveCalls).toEqual([
      {
        convexUrl: "https://fresh-site-123.convex.cloud",
        mode: "server",
        adminKey: "prod:fresh-site-123|deploy-token",
        adminName: "First Admin",
        adminEmail: "admin@example.com",
        adminPassword: "CorrectHorseBatteryStaple42!",
      },
    ]);
    expect(result.launchCalls).toEqual(["launch"]);
    expect(result.currentStep).toBe("complete");
    expect(result.completeMessage).toContain(
      "Your admin account is ready and ConvexPress will sign you in now.",
    );
    expect(result.clearedState).toEqual({
      deployKey: "",
      adminName: "",
      adminEmail: "",
      adminPassword: "",
    });
    expect(result.clearedInputs).toEqual({
      deployKey: "",
      adminName: "",
      adminEmail: "",
      adminPassword: "",
      adminConfirm: "",
    });
  });

  test("client setup saves login credentials then launches app for automatic sign-in", async () => {
    const result = await runWizardScenario(`
      const saveCalls = [];
      const launchCalls = [];
      window.convexpressSetup.saveConfig = async (options) => {
        saveCalls.push(options);
        return { success: true };
      };
      window.convexpressSetup.launchApp = async () => {
        launchCalls.push("launch");
      };

      state.mode = "client";
      state.convexUrl = "https://existing-site-456.convex.cloud";
      state.clientIdentifier = "admin@example.com";
      state.clientPassword = "CorrectHorseBatteryStaple42!";
      $("input-client-identifier").value = state.clientIdentifier;
      $("input-client-password").value = state.clientPassword;

      await completeSetup();
      await flushTimers();

      return {
        saveCalls,
        launchCalls,
        currentStep: state.currentStep,
        completeMessage: $("complete-message").textContent,
        clearedState: {
          clientIdentifier: state.clientIdentifier,
          clientPassword: state.clientPassword,
        },
        clearedInputs: {
          clientIdentifier: $("input-client-identifier").value,
          clientPassword: $("input-client-password").value,
        },
      };
    `);

    expect(result.saveCalls).toEqual([
      {
        convexUrl: "https://existing-site-456.convex.cloud",
        mode: "client",
        clientIdentifier: "admin@example.com",
        clientPassword: "CorrectHorseBatteryStaple42!",
      },
    ]);
    expect(result.launchCalls).toEqual(["launch"]);
    expect(result.currentStep).toBe("complete");
    expect(result.completeMessage).toContain(
      "ConvexPress will sign you in with the credentials you provided.",
    );
    expect(result.clearedState).toEqual({
      clientIdentifier: "",
      clientPassword: "",
    });
    expect(result.clearedInputs).toEqual({
      clientIdentifier: "",
      clientPassword: "",
    });
  });
});
