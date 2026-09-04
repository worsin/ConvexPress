#!/usr/bin/env bun
/**
 * Seed a demo shop into a ConvexPress site deployment.
 *
 *   SITE_ADMIN_KEY=… OPENROUTER_API_KEY=… bun run scripts/seed-demo-shop.ts \
 *     --shop northstar-coffee --url http://127.0.0.1:14820 \
 *     [--site-url http://127.0.0.1:4201] [--images ./cache/dir] [--skip-images] [--model anthropic/claude-sonnet-4.6]
 *
 * Steps
 *   1. Ask the deployment for the shop's product list and image prompts.
 *   2. Generate one product photo per product with OpenRouter's image model
 *      (cached on disk, so re-runs are free).
 *   3. Upload each image through the site's internal media importer.
 *   4. Run the seed mutation with the slug → media id map.
 *
 * Secrets come from the environment only; nothing is passed on the command line.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

const shop = arg("shop");
const url = arg("url");
const siteUrl = arg("site-url");
const imagesDir = arg("images", path.resolve(process.cwd(), ".demo-images"))!;
const skipImages = process.argv.includes("--skip-images");
const model = arg("model");
const imageModel = arg("image-model", "google/gemini-2.5-flash-image")!;
const adminKey = process.env.SITE_ADMIN_KEY;
const openRouterKey = process.env.OPENROUTER_API_KEY;

if (!shop || !url || !adminKey) {
  console.error("usage: SITE_ADMIN_KEY=… bun run scripts/seed-demo-shop.ts --shop <key> --url <convex url> [--site-url …]");
  process.exit(1);
}

const client = new ConvexHttpClient(url);
client.setAdminAuth(adminKey);

const listShops = makeFunctionReference<"query">("demoSeed/shops:listShops");
const importMedia = makeFunctionReference<"action">("demoSeed/actions:importGeneratedMedia");
const seedShop = makeFunctionReference<"mutation">("demoSeed/shops:seedShop");

async function generateImage(prompt: string): Promise<{ mime: string; bytes: Buffer }> {
  if (!openRouterKey) throw new Error("OPENROUTER_API_KEY is required to generate images (or pass --skip-images)");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://convexpress.com",
      "X-Title": "ConvexPress demo seed",
    },
    body: JSON.stringify({
      model: imageModel,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!response.ok) throw new Error(`image request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const data = (await response.json()) as any;
  const image = data.choices?.[0]?.message?.images?.[0];
  const dataUrl: string | undefined = image?.image_url?.url ?? image?.url;
  if (!dataUrl?.startsWith("data:")) throw new Error(`no image in response: ${JSON.stringify(data).slice(0, 300)}`);
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("unexpected image data url");
  return { mime: match[1]!, bytes: Buffer.from(match[2]!, "base64") };
}

function cachedPath(slug: string): string | null {
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const file = path.join(imagesDir, shop!, `${slug}.${ext}`);
    if (existsSync(file)) return file;
  }
  return null;
}

async function main() {
  const shops = (await client.query(listShops, {})) as Array<{
    key: string;
    siteTitle: string;
    products: Array<{ slug: string; title: string; imagePrompt: string }>;
  }>;
  const entry = shops.find((candidate) => candidate.key === shop);
  if (!entry) throw new Error(`deployment does not know shop "${shop}" (has: ${shops.map((s) => s.key).join(", ")})`);
  console.log(`Seeding ${entry.siteTitle} (${entry.products.length} products) into ${url}`);

  const media: Record<string, string> = {};
  if (!skipImages) {
    mkdirSync(path.join(imagesDir, shop!), { recursive: true });
    for (const [index, product] of entry.products.entries()) {
      let file = cachedPath(product.slug);
      if (!file) {
        process.stdout.write(`  [${index + 1}/${entry.products.length}] generating ${product.slug} … `);
        let attempt = 0;
        while (true) {
          try {
            const { mime, bytes } = await generateImage(product.imagePrompt);
            const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
            file = path.join(imagesDir, shop!, `${product.slug}.${ext}`);
            writeFileSync(file, bytes);
            console.log(`${Math.round(bytes.length / 1024)} KB`);
            break;
          } catch (error) {
            attempt += 1;
            if (attempt >= 3) throw error;
            console.log(`retry ${attempt} (${error instanceof Error ? error.message : error})`);
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
          }
        }
      }
      const bytes = readFileSync(file);
      const ext = path.extname(file).slice(1);
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
      const record = (await client.action(importMedia, {
        title: product.title,
        fileName: `${product.slug}.${ext}`,
        altText: product.title,
        caption: undefined,
        description: undefined,
        dataUrl,
      })) as { mediaId?: string; _id?: string } | string;
      const mediaId = typeof record === "string" ? record : record?.mediaId ?? record?._id;
      if (!mediaId) throw new Error(`media import returned no id for ${product.slug}: ${JSON.stringify(record).slice(0, 200)}`);
      media[product.slug] = String(mediaId);
      if (file && existsSync(file)) process.stdout.write(`  uploaded ${product.slug}\n`);
    }
  }

  const result = await client.mutation(seedShop, {
    shop,
    media,
    aiApiKey: openRouterKey,
    aiModel: model,
    siteUrl,
  });
  console.log("Seeded:", result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
