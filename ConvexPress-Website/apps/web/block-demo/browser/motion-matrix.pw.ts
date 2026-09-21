import { selectPackReady } from "./pack-ready";
import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { decodeCaptureMedia } from "./capture-media";

for (const dpr of [1, 2]) test.describe(`SDK motion at DPR ${dpr}`, () => {
  test.use({ deviceScaleFactor: dpr });
  for (const surface of ["sdk", "block"] as const) for (const pack of ["core", "journal", "depot", "aster-house"]) for (const width of [1440, 390]) {
    test(`${surface} · ${pack} at ${width}px: compositor, frame budget and reduced motion`, async ({ page, browser }, info) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto("/", { waitUntil: "networkidle" });
      await selectPackReady(page, pack);
      if (surface === "block") {
        await page.locator("#canonical-block").selectOption("core/marquee");
        await page.locator("#canonical-example").selectOption("1");
      }
      const surfaceRoot = page.locator(surface === "sdk" ? ".cp-marquee" : ".canonical-canvas .cp-library-rich-marquee");
      await surfaceRoot.scrollIntoViewIfNeeded();
      await decodeCaptureMedia(surfaceRoot);
      await page.evaluate(() => document.fonts.ready);
      const cdp = await page.context().newCDPSession(page);
      const system = await browser.newBrowserCDPSession();
      const { gpu } = await system.send("SystemInfo.getInfo");
      await system.detach();
      let layers: Array<{ layerId: string; backendNodeId?: number }> = [];
      const paints: string[] = [];
      cdp.on("LayerTree.layerTreeDidChange", event => { layers = event.layers ?? []; });
      cdp.on("LayerTree.layerPainted", event => paints.push(event.layerId));
      await cdp.send("LayerTree.enable");
      const trackSelector = surface === "sdk" ? ".cp-marquee-track" : ".canonical-canvas .cp-library-rich-marquee-track";
      const track = page.locator(trackSelector);
      await surfaceRoot.getByRole("button", { name: "Play motion", exact: true }).click();
      await page.mouse.move(0, 0);
      await expect.poll(() => track.evaluate(node => getComputedStyle(node).animationPlayState)).toBe("running");
      const { root } = await cdp.send("DOM.getDocument");
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: trackSelector });
      const { node } = await cdp.send("DOM.describeNode", { nodeId });
      await expect.poll(() => layers.filter(layer => layer.backendNodeId === node.backendNodeId).length).toBeGreaterThan(0);
      const layer = layers.find(layer => layer.backendNodeId === node.backendNodeId)!;
      const compositor = await cdp.send("LayerTree.compositingReasons", { layerId: layer.layerId });
      paints.length = 0;
      const timing = await track.evaluate(async element => {
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const before = getComputedStyle(element).transform;
        const longTasks: number[] = [], frames: number[] = [];
        const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)));
        observer.observe({ type: "longtask", buffered: false });
        await new Promise<void>(resolve => {
          let last: number | null = null;
          const sample = (now: number) => {
            if (last !== null) frames.push(now - last);
            last = now;
            if (frames.length === 120) resolve(); else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
        observer.disconnect();
        const sorted = [...frames].sort((a, b) => a - b), medianMs = sorted[60];
        return { dpr: devicePixelRatio, before, after: getComputedStyle(element).transform,
          frames: frames.length, medianMs, p95Ms: sorted[114], maxMs: sorted[119],
          framesOverTwiceMedian: frames.filter(value => value > medianMs * 2 + 1).length, longTasks };
      });
      const evidence = { surface, pack, width, dpr, timing, compositor, steadyLayerPaints: paints.filter(id => id === layer.layerId).length,
        gpu: { devices: gpu.devices, featureStatus: gpu.featureStatus }, errors,
        scope: "Local Chromium SDK text marquee and canonical core/marquee image track; not every block animation or universal device certification" };
      await writeFile(info.outputPath("motion-evidence.json"), JSON.stringify(evidence, null, 2));
      if (process.env.BLOCK_DEMO_REQUIRE_GPU === "1")
        expect(gpu.featureStatus?.gpu_compositing, "Hardware GPU compositor required for this acceptance run").toBe("enabled");
      expect(timing.dpr).toBe(dpr);
      expect(timing.before).not.toBe(timing.after);
      expect(compositor.compositingReasonIds.some(reason => /active.*transform.*animation/i.test(reason))).toBe(true);
      expect(timing.p95Ms).toBeLessThanOrEqual(34);
      expect(timing.maxMs).toBeLessThanOrEqual(100);
      expect(timing.framesOverTwiceMedian).toBeLessThanOrEqual(6);
      expect(timing.longTasks).toEqual([]);
      await surfaceRoot.getByRole("button", { name: "Pause motion", exact: true }).click();
      await expect.poll(() => track.evaluate(element => getComputedStyle(element).animationPlayState)).toBe("paused");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect.poll(() => track.evaluate(element => getComputedStyle(element).animationName)).toBe("none");
      await expect.poll(() => track.evaluate(element => getComputedStyle(element).transform)).toBe("none");
      expect(errors).toEqual([]);
      await cdp.detach();
    });
  }
});
