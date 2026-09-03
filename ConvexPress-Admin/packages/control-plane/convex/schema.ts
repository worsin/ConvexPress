import { defineSchema } from "convex/server";

import { authTables } from "./schema/auth";
import { rbacTables } from "./schema/rbac";
import { serverBootstrapTables } from "./schema/serverBootstrap";
import { userProfileTables } from "./schema/userProfiles";
import { hierarchyTables } from "./schema/hierarchy";
import { connectionTables } from "./schema/connections";

export default defineSchema({
  ...authTables,
  ...userProfileTables,
  ...rbacTables,
  ...serverBootstrapTables,
  ...hierarchyTables,
  ...connectionTables,
});
