import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";

import { prepareLiveHostHydration } from "./live-hosts-hydration";

test("hydration loads the hosts every server-rendered body names, once each, before returning", async () => {
  const root = new JSDOM(
    '<template data-live-hosts="formEmbed poll"></template><main><template data-live-hosts="poll newsletter"></template></main><template data-live-hosts="not-a-host <script>"></template>',
  ).window.document;
  const loaded: string[][] = [];
  let settled = false;
  await prepareLiveHostHydration(root, async () => ({
    loadLiveHosts: async (ids) => {
      loaded.push([...ids]);
      await Promise.resolve();
      settled = true;
    },
  }));
  expect(loaded).toEqual([["formEmbed", "poll", "newsletter"]]);
  expect(settled).toBe(true);
});

test("a page without live blocks never imports the hosts", async () => {
  let imports = 0;
  await prepareLiveHostHydration(new JSDOM("<main>Ordinary page</main>").window.document, async () => {
    imports++;
    throw Error("Unexpected load");
  });
  expect(imports).toBe(0);
});
