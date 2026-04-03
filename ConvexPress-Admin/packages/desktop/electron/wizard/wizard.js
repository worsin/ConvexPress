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
  complete: $("step-complete"),
};

const dots = Array.from(document.querySelectorAll(".step-indicators .dot"));

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
  const nextBtn = $("btn-client-test-next");
  if (nextBtn) nextBtn.classList.remove("hidden");
  showStep("client-url");
});

$("btn-client-test-next").addEventListener("click", () => {
  completeSetup();
});

// ── Connection Test (shared) ──────────────────────────────────────────────

async function startConnectionTest(path) {
  const prefix = path; // 'server' or 'client'
  const statusEl = $(`${prefix}-test-status`);
  const actionsEl = $(`${prefix}-test-actions`);

  // Reset to spinner state
  statusEl.className = "test-status";
  statusEl.innerHTML = `<div class="spinner"></div><p id="${prefix}-test-message">Connecting to your Convex deployment...</p>`;
  actionsEl.classList.add("hidden");

  try {
    const result = await window.convexpressSetup.testConnection(state.convexUrl);

    if (result && result.ok) {
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
    const errorText =
      err && err.message
        ? err.message
        : "Connection failed. Check the URL and try again.";
    showTestError(statusEl, actionsEl, prefix, errorText);
  }
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

  // Server mode: include deploy key
  if (state.mode === "server") {
    options.adminKey = state.deployKey;
  }

  try {
    await window.convexpressSetup.saveConfig(options);

    // Set completion message based on mode
    const completeMsg = $("complete-message");
    if (state.mode === "server") {
      completeMsg.textContent =
        "Your admin account will be created when the app launches for the first time.";
    } else {
      completeMsg.textContent =
        "Sign in with the credentials provided by your administrator.";
    }

    showStep("complete");
  } catch (err) {
    console.error("Failed to save config:", err);
  }
}

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
