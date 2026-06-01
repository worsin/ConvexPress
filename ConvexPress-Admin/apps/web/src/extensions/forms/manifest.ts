/**
 * ConvexPress Forms — admin manifest (v2 Layer 4)
 *
 * The scanner at apps/web/src/lib/plugins/registry.ts globs this file and
 * appends it to ADMIN_PLUGINS. No registration step.
 */

import { FileText } from "lucide-react";
import type { AdminPluginDefinition } from "@/lib/plugins/registry";

const manifest: AdminPluginDefinition = {
  id: "forms",
  title: "Forms",
  description:
    "Build any form — contact, signup, multi-step — with conditional logic, calculations, and post-submit actions.",
  icon: FileText,
  settingsKey: "formsEnabled",
  navSectionIds: ["forms"],
  adminAccessPrefixes: ["/forms"],
  routePrefixes: ["/forms"],
  defaultEnabled: false,
};

export default manifest;
