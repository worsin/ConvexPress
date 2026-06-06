import { test as setup } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authenticateAdminForSmoke } from "./_auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_STATE = path.resolve(__dirname, ".auth/admin.json");

setup("authenticate as admin", async ({ page }) => {
	await authenticateAdminForSmoke(page);
	await page.context().storageState({ path: ADMIN_STATE });
});
