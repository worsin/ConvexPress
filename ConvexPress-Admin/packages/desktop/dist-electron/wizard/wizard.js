/**
 * ConvexPress Setup Wizard — Vanilla JS
 * Communicates with the Electron main process via window.convexpressSetup (preload bridge).
 */

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  mode: "",        // 'server' or 'client'
  convexUrl: "",
  deployKey: "",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
  clientIdentifier: "",
  clientPassword: "",
  currentStep: "welcome",
};

// Dot indices for step indicators
const STEP_DOT_INDEX = {
  welcome: 0,
  mode: 1,
  "server-config": 2,
  "server-test": 3,
  "admin-create": 4,
  "client-url": 2,
  "client-test": 3,
  "client-credentials": 4,
  provision: 4,
  complete: 4,
};

// ── DOM refs ───────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const steps = {
  welcome: $("step-welcome"),
  mode: $("step-mode"),
  "server-config": $("step-server-config"),
  "server-test": $("step-server-test"),
  "admin-create": $("step-admin-create"),
  "client-url": $("step-client-url"),
  "client-test": $("step-client-test"),
  "client-credentials": $("step-client-credentials"),
  provision: $("step-provision"),
  complete: $("step-complete"),
};

const dots = Array.from(document.querySelectorAll(".step-indicators .dot"));
let removeProgressListener = null;
let connectionTestSerial = 0;
const latestConnectionTestByPath = {
  server: 0,
  client: 0,
};

function getConnectionTestStep(path) {
  return `${path}-test`;
}

function invalidateConnectionTest(path) {
  latestConnectionTestByPath[path] = ++connectionTestSerial;
}

// ── Navigation ─────────────────────────────────────────────────────────────

function showStep(stepId) {
  state.currentStep = stepId;

  // Hide all steps
  Object.values(steps).forEach((el) => {
    if (el) el.classList.add("hidden");
  });

  // Show the target step
  const target = steps[stepId];
  if (target) target.classList.remove("hidden");

  // Update dot indicators
  const dotIndex = STEP_DOT_INDEX[stepId];
  dots.forEach((dot, i) => {
    dot.classList.toggle("active", i === dotIndex);
  });
}

// ── Shared Validation ──────────────────────────────────────────────────────

const CONVEX_URL_RE = /^https:\/\/[a-z0-9-]+\.convex\.cloud\/?$/;

function validateConvexUrl(url) {
  return CONVEX_URL_RE.test(url.trim());
}

function setError(elementId, message) {
  const errorEl = $(elementId);
  if (!errorEl) return;
  if (message) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  } else {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  }
}

// ── Step: Welcome ──────────────────────────────────────────────────────────

$("btn-welcome-next").addEventListener("click", () => {
  showStep("mode");
});

// ── Step: Mode Selection ───────────────────────────────────────────────────

$("btn-mode-server").addEventListener("click", () => {
  state.mode = "server";
  showStep("server-config");
});

$("btn-mode-client").addEventListener("click", () => {
  state.mode = "client";
  showStep("client-url");
});

$("btn-mode-back").addEventListener("click", () => {
  showStep("welcome");
});

// ── Step: Server — Config (URL + Deploy Key) ─────────────────────────────

function proceedFromServerConfig() {
  const url = $("input-server-url").value.trim();
  const key = $("input-deploy-key").value.trim();

  if (!url) {
    setError("server-config-error", "Please enter your Convex deployment URL.");
    return;
  }
  if (!validateConvexUrl(url)) {
    setError(
      "server-config-error",
      "URL must match: https://your-app-123.convex.cloud",
    );
    return;
  }
  if (!key) {
    setError("server-config-error", "Please enter your deploy key.");
    return;
  }

  setError("server-config-error", "");
  state.convexUrl = url;
  state.deployKey = key;
  showStep("server-test");
  startConnectionTest("server");
}

$("btn-server-config-next").addEventListener("click", proceedFromServerConfig);
$("input-server-url").addEventListener("input", () =>
  setError("server-config-error", ""),
);
$("input-deploy-key").addEventListener("input", () =>
  setError("server-config-error", ""),
);
$("input-deploy-key").addEventListener("keydown", (e) => {
  if (e.key === "Enter") proceedFromServerConfig();
});
$("btn-server-config-back").addEventListener("click", () => showStep("mode"));

// Toggle key visibility
$("btn-toggle-key").addEventListener("click", () => {
  const input = $("input-deploy-key");
  input.type = input.type === "password" ? "text" : "password";
});

// ── Step: Server — Connection Test ────────────────────────────────────────

$("btn-server-test-back").addEventListener("click", () => {
  invalidateConnectionTest("server");
  const nextBtn = $("btn-server-test-next");
  if (nextBtn) nextBtn.classList.remove("hidden");
  showStep("server-config");
});

$("btn-server-test-next").addEventListener("click", () => {
  showStep("admin-create");
});

// ── Step: Server — Create Admin Account ───────────────────────────────────

function proceedFromAdminCreate() {
  const name = $("input-admin-name").value.trim();
  const email = $("input-admin-email").value.trim();
  const password = $("input-admin-password").value;
  const confirm = $("input-admin-confirm").value;

  if (!name || !email || !password) {
    setError("admin-create-error", "Please fill in all fields.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError("admin-create-error", "Please enter a valid email address.");
    return;
  }
  if (password.length < 8) {
    setError(
      "admin-create-error",
      "Password must be at least 8 characters.",
    );
    return;
  }
  if (password !== confirm) {
    setError("admin-create-error", "Passwords do not match.");
    return;
  }

  setError("admin-create-error", "");
  state.adminName = name;
  state.adminEmail = email;
  state.adminPassword = password;

  completeSetup();
}

$("btn-admin-create-next").addEventListener("click", proceedFromAdminCreate);
$("btn-admin-create-back").addEventListener("click", () =>
  showStep("server-test"),
);

// Clear error on input
[
  "input-admin-name",
  "input-admin-email",
  "input-admin-password",
  "input-admin-confirm",
].forEach((id) => {
  $(id).addEventListener("input", () => setError("admin-create-error", ""));
});

// ── Step: Client — Convex URL ─────────────────────────────────────────────

function proceedFromClientUrl() {
  const url = $("input-client-url").value.trim();
  if (!url) {
    setError("client-url-error", "Please enter the Convex deployment URL.");
    return;
  }
  if (!validateConvexUrl(url)) {
    setError(
      "client-url-error",
      "URL must match: https://your-app-123.convex.cloud",
    );
    return;
  }
  setError("client-url-error", "");
  state.convexUrl = url;
  showStep("client-test");
  startConnectionTest("client");
}

$("btn-client-url-next").addEventListener("click", proceedFromClientUrl);
$("input-client-url").addEventListener("keydown", (e) => {
  if (e.key === "Enter") proceedFromClientUrl();
});
$("input-client-url").addEventListener("input", () =>
  setError("client-url-error", ""),
);
$("btn-client-url-back").addEventListener("click", () => showStep("mode"));

// ── Step: Client — Connection Test ────────────────────────────────────────

$("btn-client-test-back").addEventListener("click", () => {
  invalidateConnectionTest("client");
  const nextBtn = $("btn-client-test-next");
  if (nextBtn) nextBtn.classList.remove("hidden");
  showStep("client-url");
});

$("btn-client-test-next").addEventListener("click", () => {
  showStep("client-credentials");
});

// ── Step: Client — Credentials ───────────────────────────────────────────

function proceedFromClientCredentials() {
  const identifier = $("input-client-identifier").value.trim();
  const password = $("input-client-password").value;

  if (!identifier || !password) {
    setError(
      "client-credentials-error",
      "Please enter your username/email and password.",
    );
    return;
  }

  setError("client-credentials-error", "");
  state.clientIdentifier = identifier;
  state.clientPassword = password;
  completeSetup();
}

$("btn-client-credentials-next").addEventListener(
  "click",
  proceedFromClientCredentials,
);
$("btn-client-credentials-back").addEventListener("click", () =>
  showStep("client-test"),
);
["input-client-identifier", "input-client-password"].forEach((id) => {
  $(id).addEventListener("input", () =>
    setError("client-credentials-error", ""),
  );
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") proceedFromClientCredentials();
  });
});

// ── Connection Test (shared) ──────────────────────────────────────────────

async function startConnectionTest(path) {
  const prefix = path; // 'server' or 'client'
  const statusEl = $(`${prefix}-test-status`);
  const actionsEl = $(`${prefix}-test-actions`);
  const requestedUrl = state.convexUrl;
  const testId = ++connectionTestSerial;
  latestConnectionTestByPath[prefix] = testId;

  // Reset to spinner state
  statusEl.className = "test-status";
  statusEl.innerHTML = `<div class="spinner"></div><p id="${prefix}-test-message">Connecting to your Convex deployment...</p>`;
  actionsEl.classList.add("hidden");

  try {
    const result = await window.convexpressSetup.testConnection(requestedUrl);
    if (!isCurrentConnectionTest(prefix, testId, requestedUrl)) return;

    if (result && result.ok) {
      const nextBtn = $(`btn-${prefix}-test-next`);
      if (nextBtn) nextBtn.classList.remove("hidden");
      statusEl.classList.add("success");
      statusEl.innerHTML = `<div class="status-icon">&#10003;</div><p id="${prefix}-test-message">Connection successful!</p>`;
      actionsEl.classList.remove("hidden");
    } else {
      const errorText =
        (result && (result.error || `Status: ${result.status}`)) ||
        "Could not connect to the deployment.";
      showTestError(statusEl, actionsEl, prefix, errorText);
    }
  } catch (err) {
    if (!isCurrentConnectionTest(prefix, testId, requestedUrl)) return;
    const errorText =
      err && err.message
        ? err.message
        : "Connection failed. Check the URL and try again.";
    showTestError(statusEl, actionsEl, prefix, errorText);
  }
}

function isCurrentConnectionTest(prefix, testId, requestedUrl) {
  return (
    latestConnectionTestByPath[prefix] === testId &&
    state.convexUrl === requestedUrl &&
    state.currentStep === getConnectionTestStep(prefix)
  );
}

function showTestError(statusEl, actionsEl, prefix, message) {
  statusEl.classList.add("error");
  statusEl.innerHTML = `<div class="status-icon">&#10007;</div><p id="${prefix}-test-message">${escapeHtml(message)}</p>`;
  actionsEl.classList.remove("hidden");
  // Hide the next button, only show back
  const nextBtn = $(`btn-${prefix}-test-next`);
  if (nextBtn) nextBtn.classList.add("hidden");
}

// ── Complete Setup ────────────────────────────────────────────────────────

async function completeSetup() {
  const options = {
    convexUrl: state.convexUrl,
    mode: state.mode,
  };

  // Server mode: include deploy key and admin credentials
  if (state.mode === "server") {
    options.adminKey = state.deployKey;

    if (state.adminName || state.adminEmail || state.adminPassword) {
      options.adminName = state.adminName;
      options.adminEmail = state.adminEmail;
      options.adminPassword = state.adminPassword;
    }
  }

  if (state.mode === "client") {
    options.clientIdentifier = state.clientIdentifier;
    options.clientPassword = state.clientPassword;
  }

  try {
    showProvisionInProgress(
      state.mode === "server"
        ? "Deploying Convex backend code..."
        : "Saving connection details...",
    );

    const result = await window.convexpressSetup.saveConfig(options);
    if (result && result.success === false) {
      throw new Error(result.error || "Setup failed.");
    }
    if (removeProgressListener) {
      removeProgressListener();
      removeProgressListener = null;
    }
    clearCredentialState();

    // Set completion message based on mode
    const completeMsg = $("complete-message");
    if (state.mode === "server") {
      completeMsg.textContent =
        "Backend deployed. Your admin account is ready and ConvexPress will sign you in now.";
    } else {
      completeMsg.textContent =
        "Connection saved. ConvexPress will sign you in with the credentials you provided.";
    }

    showStep("complete");
    setTimeout(() => {
      try {
        window.convexpressSetup.launchApp();
      } catch (err) {
        console.error("launchApp failed:", err);
      }
    }, 700);
  } catch (err) {
    console.error("Failed to save config:", err);
    showProvisionError(
      err && err.message
        ? err.message
        : "Setup failed. Check the details and try again.",
    );
  }
}

function clearCredentialState() {
  state.deployKey = "";
  state.adminName = "";
  state.adminEmail = "";
  state.adminPassword = "";
  state.clientIdentifier = "";
  state.clientPassword = "";

  [
    "input-deploy-key",
    "input-admin-name",
    "input-admin-email",
    "input-admin-password",
    "input-admin-confirm",
    "input-client-identifier",
    "input-client-password",
  ].forEach((id) => {
    const input = $(id);
    if (input) input.value = "";
  });
}

function showProvisionInProgress(message) {
  setError("provision-error", "");
  $("provision-actions").classList.add("hidden");

  const statusEl = $("provision-status");
  statusEl.className = "test-status";
  statusEl.innerHTML = `<div class="spinner"></div><p id="provision-message">${escapeHtml(message)}</p>`;

  if (removeProgressListener) {
    removeProgressListener();
    removeProgressListener = null;
  }

  if (window.convexpressSetup.onProgress) {
    removeProgressListener = window.convexpressSetup.onProgress((event) => {
      const nextMessage =
        event && event.message ? event.message : "Working on setup...";
      const messageEl = $("provision-message");
      if (messageEl) messageEl.textContent = nextMessage;
    });
  }

  showStep("provision");
}

function showProvisionError(message) {
  if (removeProgressListener) {
    removeProgressListener();
    removeProgressListener = null;
  }

  const statusEl = $("provision-status");
  statusEl.className = "test-status error";
  statusEl.innerHTML = `<div class="status-icon">&#10007;</div><p id="provision-message">Setup failed.</p>`;
  setError("provision-error", message);
  $("provision-actions").classList.remove("hidden");
}

$("btn-provision-back").addEventListener("click", () => {
  if (state.mode === "server") {
    showStep("admin-create");
    return;
  }
  showStep("client-credentials");
});

$("btn-provision-retry").addEventListener("click", () => {
  completeSetup();
});

// ── Step: Complete ────────────────────────────────────────────────────────

$("btn-launch").addEventListener("click", () => {
  try {
    window.convexpressSetup.launchApp();
  } catch (err) {
    console.error("launchApp failed:", err);
  }
});

// ── Close Button ──────────────────────────────────────────────────────────

$("btn-close").addEventListener("click", () => {
  try {
    window.convexpressSetup.quit();
  } catch (err) {
    console.error("quit failed:", err);
    window.close();
  }
});

// ── Utilities ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Init ──────────────────────────────────────────────────────────────────

(function init() {
  showStep("welcome");
})();
