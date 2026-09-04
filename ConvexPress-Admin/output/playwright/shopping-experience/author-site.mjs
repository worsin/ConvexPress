// Author a demo storefront's content THROUGH the ConvexPress admin UI (Electron),
// exactly the way a site owner would: Media Library uploads, pages built in the
// block editor, Reading → static front page, header/footer menus in Menus.
//
//   printf '%s\n' "$CREDS_JSON" | node author-site.mjs <northstar|ridgeline> [--only media,pages,reading,menus] [--shots DIR] [--keep]
import { mkdtemp, mkdir, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const admin = "/Users/worsin/Development/ConvexPress/ConvexPress-Admin";
const desktopRoot = join(admin, "packages/desktop");
const bunModules = join(admin, "node_modules/.bun");
const imagesRoot = resolve(here, "../images");
const shopKey = process.argv[2];
const onlyFlag = process.argv.indexOf("--only");
const only = onlyFlag > -1 ? new Set(process.argv[onlyFlag + 1].split(",")) : new Set(["media", "pages", "reading", "menus"]);
const shotsFlag = process.argv.indexOf("--shots");
const shots = resolve(shotsFlag > -1 ? process.argv[shotsFlag + 1] : join(here, `shots-author-${shopKey}`));
const keep = process.argv.includes("--keep");
const pagesFlag = process.argv.indexOf("--pages");
const pageFilter = pagesFlag > -1 ? new Set(process.argv[pagesFlag + 1].split(",")) : null;
const CONTROL = "http://192.168.1.246:4720";
const CONTROL_SITE = "http://192.168.1.246:4721";

// ───────────────────────────── content ─────────────────────────────
const SHOPS = {
  northstar: {
    switcher: ["Northstar", /Northstar Coffee/],
    imagesDir: join(imagesRoot, "northstar-coffee/site"),
    email: "hello@northstar.coffee",
    slugs: { Help: "faq" },
    layouts: { shop: "Boutique", product: "Split" },
    template: "Journal",
    pages: [
      {
        title: "Home",
        blocks: [
          { block: "Hero (split)", fields: {
            Eyebrow: "Small-batch roasting since 2016",
            Title: "Coffee worth waking up for.",
            Body: "Espresso machines, grinders and beans chosen by people who pull shots every morning. Dialed-in advice included with every order.",
            "Media Alt": "Home espresso machine pulling a shot on a walnut counter",
            "Media Side": "right",
            "Primary CTA Label": "Shop coffee", "Primary CTA URL": "/products?category=coffee-beans",
            "Secondary CTA Label": "Find your setup", "Secondary CTA URL": "/products",
          }, media: { label: "Hero image", needle: "hero-espresso-bar" } },
          { block: "Category Tiles", fields: { Eyebrow: "Shop by category", Heading: "Everything from bean to cup", Intro: "Six departments, one standard: gear we would put on our own counter.", "Max tiles": 6, Columns: 3 } },
          { block: "Product Showcase", fields: { Eyebrow: "New this month", Heading: "Fresh off the roaster", Products: "newest", Count: 4, Columns: 4, "CTA label": "See all products", "CTA URL": "/products" } },
          { block: "Feature Grid", fields: { Eyebrow: "Why Northstar", Heading: "Built for the home barista", Intro: "" },
            repeater: { add: "Add item", remove: "Remove card", items: [
              { Title: "Roasted to order", Description: "Beans roast the week you order and ship within 48 hours, with the roast date on every bag." },
              { Title: "Free shipping over $50", Description: "Flat-rate shipping on everything else, and machines ship insured with a signature." },
              { Title: "Dial-in support", Description: "Every machine and grinder comes with a 30-minute call to get your first shots right." },
            ] } },
          { block: "Media + Text", fields: {
            Eyebrow: "Our roastery", Heading: "Roasted in a converted boathouse in Duluth",
            Body: "We started with a 5 kg roaster and a spreadsheet of ratios. Ten years on we still cup every batch before it ships.",
            "Media Alt": "Inside the Northstar roastery", "Media Position": "left", "CTA Label": "Read our story", "CTA URL": "/our-story",
          }, media: { label: "Image", needle: "story-roastery" } },
          { block: "Testimonials", fields: { Eyebrow: "From the counter", Heading: "What home baristas say", Intro: "" },
            repeater: { add: "Add item", remove: "Remove testimonial", items: [
              { Quote: "The dial-in call alone was worth it. First latte art within a week.", Name: "Priya M.", Role: "Compact 15 owner" },
              { Quote: "Ordered Monday, roasted Tuesday, on my counter Thursday. Every time.", Name: "Daniel R.", Role: "Subscriber since 2021" },
              { Quote: "They talked me out of a more expensive grinder. Who does that?", Name: "Hannah L.", Role: "Pour-over convert" },
            ] } },
          { block: "Shopping Assistant Band", fields: {
            Eyebrow: "Northstar assistant", Heading: "Not sure what fits your setup? Ask.",
            Body: "Tell the assistant what you brew with and it checks fit before it suggests anything, and it knows what is already in your cart.",
            "Example questions (one per line; empty uses the assistant's starter prompts)": "Which grinder pairs with the Compact 15?\nWhat do I need to start making espresso at home?\nIs the Ethiopia natural good for pour-over?",
            "CTA label": "Browse the shop", "CTA URL": "/products",
          } },
          { block: "Newsletter signup", fields: { Eyebrow: "Roast notes", Heading: "New roasts, first", Body: "One email when a new coffee lands. No discounts spam, ever.", Placeholder: "you@example.com", "Submit label": "Keep me posted" } },
        ],
      },
      {
        title: "Our Story",
        blocks: [
          { block: "Hero (text only)", fields: { Eyebrow: "Our story", Title: "Ten years of chasing the perfect shot", Body: "Northstar began as two friends and a borrowed roaster. It is still run by people who brew every morning.", Alignment: "center" } },
          { block: "Media + Text", fields: { Eyebrow: "2016", Heading: "A 5 kg roaster and a spreadsheet", Body: "We roasted for friends first, then for the café down the street, then for the whole neighbourhood. The ratios from that first spreadsheet are still on the wall.", "Media Alt": "Roasting coffee", "Media Position": "right" }, media: { label: "Image", needle: "story-roastery" } },
          { block: "Stats band", fields: { Eyebrow: "By the numbers", Heading: "Small batch, wide reach", Body: "" },
            repeater: { add: "Add item", remove: "Remove stat", items: [
              { Value: "48h", Label: "roast to shipped" }, { Value: "12", Label: "origins this year" }, { Value: "9,400", Label: "machines dialed in" }, { Value: "4.9", Label: "average review" },
            ] } },
          { block: "Media + Text", fields: { Eyebrow: "Today", Heading: "Gear we would put on our own counter", Body: "Every machine and grinder we sell has spent a month in our test kitchen. If it does not earn a place on the shelf, it does not go on the site.", "Media Alt": "Burr grinder and scale", "Media Position": "left", "CTA Label": "Shop the range", "CTA URL": "/products" }, media: { label: "Image", needle: "lifestyle-grinder" } },
          { block: "CTA Band", fields: { Eyebrow: "Visit", Heading: "Come taste before you buy", Body: "Our Duluth tasting room is open Thursday to Sunday. Bring your questions.", "Primary CTA Label": "Get in touch", "Primary CTA URL": "/contact" } },
        ],
      },
      {
        title: "Help",
        blocks: [
          { block: "Hero (text only)", fields: { Eyebrow: "Help centre", Title: "Shipping, returns and dialing in", Body: "Everything you need to know before and after you order.", Alignment: "center" } },
          { block: "FAQ", fields: { Eyebrow: "Shipping & returns", Heading: "Common questions", Intro: "" },
            repeater: { add: "Add item", remove: "Remove question", items: [
              { Question: "How fast do you ship?", Answer: "Coffee roasts within 48 hours of your order and ships the same day. Machines and grinders ship within one business day, insured, with a signature on delivery." },
              { Question: "Is shipping free?", Answer: "Orders over $50 ship free in the contiguous US. Everything else is a flat $6." },
              { Question: "Can I return a machine?", Answer: "Yes. 30 days, any reason, as long as it is descaled and in its original packaging. We cover return shipping if the machine is faulty." },
              { Question: "Do you help me dial in?", Answer: "Every machine and grinder includes a 30-minute video call with a Northstar barista. Book it from your order confirmation." },
              { Question: "How should I store coffee?", Answer: "Sealed, cool, dark, and out of the fridge. Our bags have a one-way valve; just roll the top down after each use." },
            ] } },
          { block: "CTA Band", fields: { Eyebrow: "Still stuck?", Heading: "Talk to a human barista", Body: "Email us or ask the shopping assistant on any product page.", "Primary CTA Label": "Contact us", "Primary CTA URL": "/contact", "Secondary CTA Label": "Ask the assistant", "Secondary CTA URL": "/products?ask=Help%20me%20choose%20a%20grinder" } },
        ],
      },
      {
        title: "Contact",
        blocks: [
          { block: "Hero (text only)", fields: { Eyebrow: "Contact", Title: "Say hello", Body: "Questions about an order, a machine, or which beans to try next. We answer within one business day.", Alignment: "center" } },
          { block: "Contact Stack", fields: { Heading: "Northstar Coffee Co.", Intro: "Tasting room and roastery.", Phone: "+1 (218) 555-0142", Email: "hello@northstar.coffee", Address: "412 Lake Avenue South, Duluth, MN 55802", Hours: "Thu–Sun 8:00–16:00" } },
          { block: "Contact form", fields: { Eyebrow: "Write to us", Heading: "Send a message", Body: "Tell us about your setup and we will point you in the right direction.", "Submit button label": "Send message", "Recipient email": "hello@northstar.coffee", "Success message": "Thanks, we will get back to you within a business day." } },
        ],
      },
    ],
    menus: [
      { name: "Main Navigation", location: "Primary Navigation",
        links: [{ label: "Home", url: "/" }, { label: "Shop", url: "/products" }, { label: "Coffee", url: "/products?category=coffee-beans" }, { label: "Machines", url: "/products?category=espresso-machines" }],
        pages: ["Our Story", "Help", "Contact"] },
      { name: "Footer", location: "Footer Navigation",
        links: [{ label: "Shop all", url: "/products" }, { label: "Grinders", url: "/products?category=grinders" }, { label: "Brewers & kettles", url: "/products?category=brewers" }, { label: "Accessories", url: "/products?category=accessories" }, { label: "Cart", url: "/cart" }],
        pages: ["Help", "Contact"] },
    ],
  },
  ridgeline: {
    switcher: ["Ridgeline", /Ridgeline Cycles/],
    imagesDir: join(imagesRoot, "ridgeline-cycles/site"),
    email: "shop@ridgeline.bike",
    slugs: { Help: "faq" },
    layouts: { shop: "Marketplace", product: "Marketplace", density: "Dense" },
    template: "Depot",
    pages: [
      {
        title: "Home",
        blocks: [
          { block: "Hero (split)", fields: {
            Eyebrow: "Bikes, parts and the people who fit them",
            Title: "Parts that fit. Rides that don't stop.",
            Body: "Gravel, trail and commuter bikes, plus every consumable to keep them rolling. Tell us your bike and we check compatibility before you buy.",
            "Media Alt": "Gravel bike on a mountain ridge at golden hour",
            "Media Side": "right",
            "Primary CTA Label": "Shop bikes", "Primary CTA URL": "/products?category=bikes",
            "Secondary CTA Label": "Parts & consumables", "Secondary CTA URL": "/products",
          }, media: { label: "Hero image", needle: "hero-ridgeline-trail" } },
          { block: "Category Tiles", fields: { Eyebrow: "Shop by category", Heading: "Everything the bike needs", Intro: "From complete builds to chain lube.", "Max tiles": 5, Columns: 3 } },
          { block: "Product Showcase", fields: { Eyebrow: "Just landed", Heading: "New in the workshop", Products: "newest", Count: 4, Columns: 4, "CTA label": "See all products", "CTA URL": "/products" } },
          { block: "Feature Grid", fields: { Eyebrow: "Why Ridgeline", Heading: "A bike shop, not a warehouse", Intro: "" },
            repeater: { add: "Add item", remove: "Remove card", items: [
              { Title: "Fit checked before checkout", Description: "Speeds, standards and rotor sizes checked against your bike so the part that arrives is the part that fits." },
              { Title: "Built by mechanics", Description: "Every complete bike is assembled, torqued and test-ridden in our workshop before it ships." },
              { Title: "Free shipping over $75", Description: "Consumables ship same day. Bikes ship 95% assembled in a bike-safe box." },
            ] } },
          { block: "Media + Text", fields: {
            Eyebrow: "The workshop", Heading: "Twenty years of wrenching on the Front Range",
            Body: "Ridgeline started as a two-stand repair shop in Golden. The web store still ships from the same building, and the same mechanics still answer the phone.",
            "Media Alt": "Inside the Ridgeline workshop", "Media Position": "left", "CTA Label": "Our story", "CTA URL": "/our-story",
          }, media: { label: "Image", needle: "story-workshop" } },
          { block: "Testimonials", fields: { Eyebrow: "Rider reviews", Heading: "From the trail", Intro: "" },
            repeater: { add: "Add item", remove: "Remove testimonial", items: [
              { Quote: "They caught that I ordered a 12-speed chain for a 9-speed bike. Swapped it before shipping.", Name: "Marcus T.", Role: "Commute 700c rider" },
              { Quote: "Gravel Ascent arrived tuned. Rode it out of the box.", Name: "Elena S.", Role: "Gravel racer" },
              { Quote: "The assistant knew my tires were tube-type and steered me away from sealant. Smart.", Name: "Jordan K.", Role: "Weekend trail" },
            ] } },
          { block: "Shopping Assistant Band", fields: {
            Eyebrow: "Ridgeline fit check", Heading: "Not sure it fits your bike? Ask.",
            Body: "Tell the assistant what you ride. It checks speeds, standards and sizes against your cart before it recommends anything.",
            "Example questions (one per line; empty uses the assistant's starter prompts)": "What chain fits a 9-speed commuter?\nBuild me a gravel maintenance kit\nWhich brake pads go with the 180mm rotor?",
            "CTA label": "Browse parts", "CTA URL": "/products",
          } },
          { block: "Newsletter signup", fields: { Eyebrow: "Trail notes", Heading: "Ride reports and new stock", Body: "One email a month. Trails we rode, parts we tested.", Placeholder: "you@example.com", "Submit label": "Subscribe" } },
        ],
      },
      {
        title: "Our Story",
        blocks: [
          { block: "Hero (text only)", fields: { Eyebrow: "Our story", Title: "A repair shop that learned to ship", Body: "Ridgeline Cycles has been fixing bikes in Golden, Colorado since 2006. The web store is the same shop, with a longer driveway.", Alignment: "center" } },
          { block: "Media + Text", fields: { Eyebrow: "2006", Heading: "Two stands and a coffee pot", Body: "We opened in a garage with two repair stands. Riders kept asking us to order parts that actually fit, so we did, and then we put the catalog online.", "Media Alt": "Bike workshop", "Media Position": "right" }, media: { label: "Image", needle: "story-workshop" } },
          { block: "Stats band", fields: { Eyebrow: "By the numbers", Heading: "Still a bike shop", Body: "" },
            repeater: { add: "Add item", remove: "Remove stat", items: [
              { Value: "18", Label: "years in Golden" }, { Value: "6", Label: "mechanics on staff" }, { Value: "31,000", Label: "fit checks run" }, { Value: "100%", Label: "bikes test-ridden" },
            ] } },
          { block: "Media + Text", fields: { Eyebrow: "Today", Heading: "Every bike leaves tuned", Body: "Complete bikes are built, torqued and ridden around the block before they go in the box. Parts get a compatibility check against your bike before they ship.", "Media Alt": "Mountain bike on singletrack", "Media Position": "left", "CTA Label": "Shop bikes", "CTA URL": "/products?category=bikes" }, media: { label: "Image", needle: "lifestyle-mtb" } },
          { block: "CTA Band", fields: { Eyebrow: "Visit", Heading: "Bring the bike in", Body: "Workshop hours Tuesday to Saturday. Walk-ins welcome for flats and brake bleeds.", "Primary CTA Label": "Contact the shop", "Primary CTA URL": "/contact" } },
        ],
      },
      {
        title: "Help",
        blocks: [
          { block: "Hero (text only)", fields: { Eyebrow: "Help centre", Title: "Shipping, returns and fit", Body: "What to expect before and after you order.", Alignment: "center" } },
          { block: "FAQ", fields: { Eyebrow: "Shipping & returns", Heading: "Common questions", Intro: "" },
            repeater: { add: "Add item", remove: "Remove question", items: [
              { Question: "How do bikes ship?", Answer: "95% assembled in a bike-safe box: fit the front wheel, bars and pedals and go. Delivery is 3 to 5 business days, insured." },
              { Question: "Is shipping free?", Answer: "Orders over $75 ship free in the contiguous US. Consumables under that ship for a flat $5." },
              { Question: "Will this part fit my bike?", Answer: "Ask the shopping assistant on any product page, or email us your bike model. We check speeds, standards and sizes before you buy." },
              { Question: "Can I return a part?", Answer: "30 days, unused and in its packaging. Wrong-fit parts we recommended are returned at our cost." },
              { Question: "Do you service bikes bought elsewhere?", Answer: "Yes. The workshop takes any bike, any brand, Tuesday to Saturday." },
            ] } },
          { block: "CTA Band", fields: { Eyebrow: "Still stuck?", Heading: "Talk to a mechanic", Body: "Email, call, or ask the assistant.", "Primary CTA Label": "Contact us", "Primary CTA URL": "/contact", "Secondary CTA Label": "Ask the assistant", "Secondary CTA URL": "/products?ask=What%20chain%20fits%20my%20bike" } },
        ],
      },
      {
        title: "Contact",
        blocks: [
          { block: "Hero (text only)", fields: { Eyebrow: "Contact", Title: "Talk to the shop", Body: "Orders, fit questions, workshop bookings. A mechanic answers within one business day.", Alignment: "center" } },
          { block: "Contact Stack", fields: { Heading: "Ridgeline Cycles", Intro: "Workshop and web store.", Phone: "+1 (303) 555-0177", Email: "shop@ridgeline.bike", Address: "1180 Washington Avenue, Golden, CO 80401", Hours: "Tue–Sat 9:00–18:00" } },
          { block: "Contact form", fields: { Eyebrow: "Write to us", Heading: "Send a message", Body: "Include your bike model and we will check fit before we reply.", "Submit button label": "Send message", "Recipient email": "shop@ridgeline.bike", "Success message": "Thanks, a mechanic will reply within a business day." } },
        ],
      },
    ],
    menus: [
      { name: "Main Navigation", location: "Primary Navigation",
        links: [{ label: "Home", url: "/" }, { label: "Shop", url: "/products" }, { label: "Bikes", url: "/products?category=bikes" }, { label: "Drivetrain", url: "/products?category=drivetrain" }],
        pages: ["Our Story", "Help", "Contact"] },
      { name: "Footer", location: "Footer Navigation",
        links: [{ label: "Shop all", url: "/products" }, { label: "Tires & tubes", url: "/products?category=tires-tubes" }, { label: "Brakes", url: "/products?category=brakes" }, { label: "Accessories", url: "/products?category=accessories" }, { label: "Cart", url: "/cart" }],
        pages: ["Help", "Contact"] },
    ],
  },
};

const shop = SHOPS[shopKey];
if (!shop) throw new Error(`unknown shop ${shopKey}; use northstar|ridgeline`);

// ───────────────────────────── boot ─────────────────────────────
async function bunPkg(prefix, rel) {
  const entries = (await readdir(bunModules)).filter((e) => e.startsWith(prefix)).sort();
  if (!entries.length) throw new Error(`missing ${prefix}`);
  return join(bunModules, entries.at(-1), rel);
}
async function readStdinJson() {
  let input = "";
  for await (const chunk of process.stdin) { input += chunk; if (input.includes("\n")) break; }
  return input.trim() ? JSON.parse(input.trim()) : {};
}
const creds = await readStdinJson();
await mkdir(shots, { recursive: true });
const { _electron } = await import(pathToFileURL(await bunPkg("playwright@", "node_modules/playwright/index.mjs")).href);
const electronExecutable = await bunPkg("electron@", "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const profile = await mkdtemp(join(tmpdir(), "convexpress-author-"));
const userData = join(profile, "-dev");
await mkdir(userData, { recursive: true });
await writeFile(join(userData, "convexpress-config.json"), JSON.stringify({ setupComplete: true, mode: "existing", convexUrl: CONTROL, convexSiteUrl: CONTROL_SITE }));
// Pre-register the fleet's deployment origins so the shell never has to reload
// mid-run to widen its CSP (a real install registers each origin once).
await writeFile(
  join(userData, "convexpress-deployment-origins.json"),
  JSON.stringify({ origins: [4720, 4721, 4820, 4821, 4830, 4831, 4840, 4841, 4850, 4851].map((port) => `http://192.168.1.246:${port}`) }),
);
const env = {
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, USER: process.env.USER, LANG: process.env.LANG ?? "en_US.UTF-8",
  CONVEXPRESS_DESKTOP_DEV: "1",
  CONVEXPRESS_DESKTOP_DEV_URL: "http://127.0.0.1:4105",
  CONVEXPRESS_WEBSITE_REPO: "/Users/worsin/Development/ConvexPress/ConvexPress-Website",
  CONVEXPRESS_SITE_ORIGIN_MAP: JSON.stringify({
    "http://192.168.1.246:4820": "http://127.0.0.1:14820", "http://192.168.1.246:4821": "http://127.0.0.1:14821",
    "http://192.168.1.246:4830": "http://127.0.0.1:14830", "http://192.168.1.246:4831": "http://127.0.0.1:14831",
    "http://192.168.1.246:4840": "http://127.0.0.1:14840", "http://192.168.1.246:4841": "http://127.0.0.1:14841",
  }),
  // The desktop CSP allow-lists these deployment origins for the renderer.
  CONVEXPRESS_ACCEPTANCE_CONTROL_ORIGIN: CONTROL,
  CONVEXPRESS_ACCEPTANCE_CONTROL_SITE_ORIGIN: CONTROL_SITE,
  CONVEXPRESS_ACCEPTANCE_SITE_ALPHA_ORIGIN: "http://192.168.1.246:4820",
  CONVEXPRESS_ACCEPTANCE_SITE_ALPHA_SITE_ORIGIN: "http://192.168.1.246:4821",
  CONVEXPRESS_ACCEPTANCE_SITE_BETA_ORIGIN: "http://192.168.1.246:4830",
  CONVEXPRESS_ACCEPTANCE_SITE_BETA_SITE_ORIGIN: "http://192.168.1.246:4831",
  CONVEXPRESS_ACCEPTANCE_SITE_GAMMA_ORIGIN: "http://192.168.1.246:4840",
  CONVEXPRESS_ACCEPTANCE_SITE_GAMMA_SITE_ORIGIN: "http://192.168.1.246:4841",
};

const errors = [];
const started = Date.now();
const log = (...a) => console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s]`, ...a);
let shotIndex = 0;
async function shot(page, name) { shotIndex += 1; await page.screenshot({ path: join(shots, `${String(shotIndex).padStart(2, "0")}-${name}.png`), type: "png" }); log("shot", name); }
async function settle(page, ms = 1000) { await page.waitForLoadState("networkidle").catch(() => {}); await new Promise((r) => setTimeout(r, ms)); }
async function goHash(page, hash, ms = 2500) { await page.evaluate((h) => { window.location.hash = h; }, hash); await settle(page, ms); }

async function signIn(page) {
  const trigger = page.getByRole("button", { name: "Switch website" });
  if (await trigger.isVisible().catch(() => false)) return;
  await page.getByRole("textbox", { name: /email/i }).fill(creds.email);
  await page.getByLabel(/^password$/i).fill(creds.password);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await trigger.waitFor({ state: "visible", timeout: 30_000 });
}
// The shell reloads once per newly registered deployment origin (desktop CSP), so
// every click here is non-blocking and we re-wait for the switcher afterwards.
// Polls with isVisible(): unlike waitFor()/click() it does not wait for navigations
// the desktop intercepts (external links), which otherwise never "finish".
async function waitForShell(page, timeout = 60_000) {
  const trigger = page.getByRole("button", { name: "Switch website" }).first();
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await trigger.isVisible().catch(() => false)) {
      await new Promise((r) => setTimeout(r, 1500));
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("shell did not appear (Switch website button not visible)");
}
async function pickWebsite(page, needle, pattern) {
  await waitForShell(page);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.getByRole("button", { name: "Switch website" }).click({ noWaitAfter: true, timeout: 10_000 }).catch(() => {});
    const dialog = page.getByRole("dialog", { name: "Switch website" });
    if (await dialog.isVisible().catch(() => false)) {
      await dialog.getByRole("combobox", { name: "Search websites" }).fill(needle);
      await dialog.getByRole("option", { name: pattern }).first().click({ noWaitAfter: true });
      break;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  await settle(page, 4000);
  await waitForShell(page);
  const live = page.getByRole("group", { name: "Environment" }).first().getByRole("button", { name: /Live/ });
  const liveState = await live.getAttribute("aria-pressed").catch(() => null);
  const liveCurrent = await live.getAttribute("aria-current").catch(() => null);
  if (liveState !== "true" && liveCurrent === null) {
    await live.click({ noWaitAfter: true, timeout: 5000 }).catch(() => {});
    await settle(page, 3000);
  }
  await waitForShell(page);
}
// Clears any navigation Playwright thinks is pending (external links the desktop
// intercepts) so later waits do not stall on "waiting for navigation to finish".
async function resetNavigation(page) {
  await page.evaluate(() => window.stop()).catch(() => {});
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
  await settle(page, 2500);
  await waitForShell(page);
}
async function openEnvMenu(page) {
  const trigger = page.getByRole("button", { name: "Environment options" });
  await trigger.waitFor({ state: "visible", timeout: 30_000 });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await trigger.click({ noWaitAfter: true, timeout: 10_000 }).catch(() => {});
    if (await page.getByRole("menu").isVisible().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 800));
  }
  await page.getByRole("menu").waitFor({ state: "visible", timeout: 10_000 });
}

async function waitSaved(page, timeout = 15_000) {
  await page.getByText(/^Saved/).first().waitFor({ state: "visible", timeout }).catch(() => {});
}

// ───────────────────────────── media ─────────────────────────────
async function uploadMedia(page) {
  const files = (await readdir(shop.imagesDir)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
  await goHash(page, "#/media", 3000);
  // Skip files whose title already exists in this site's library.
  const existing = new Set();
  for (const f of files) {
    const stem = f.replace(/\.[a-z]+$/i, "");
    if (await page.getByText(stem, { exact: false }).first().isVisible().catch(() => false)) existing.add(f);
  }
  const todo = files.filter((f) => !existing.has(f));
  log("media: existing", [...existing].length, "uploading", todo.length);
  if (!todo.length) { await shot(page, "media-library"); return; }
  await goHash(page, "#/media/upload", 2500);
  await page.getByRole("heading", { name: "Upload New Media" }).waitFor({ timeout: 15_000 });
  await page.locator('input[type="file"]').first().setInputFiles(todo.map((f) => join(shop.imagesDir, f)));
  await page.getByText(new RegExp(`${todo.length} completed`)).waitFor({ state: "visible", timeout: 180_000 });
  await settle(page, 1000);
  await shot(page, "media-upload-complete");
  await goHash(page, "#/media", 3500);
  await shot(page, "media-library");
}

// ───────────────────────────── pages ─────────────────────────────
async function pageExists(page, title) {
  await goHash(page, "#/pages", 3000);
  await page.getByRole("heading", { name: "Pages", exact: true }).waitFor({ timeout: 15_000 }).catch(() => {});
  return page.getByRole("link", { name: title, exact: true }).first().isVisible().catch(() => false);
}
function rows(page) { return page.locator("article[data-slot=block-row]"); }
async function addBlock(page, title) {
  const before = await rows(page).count();
  await page.getByRole("button", { name: "Add block", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Block library" });
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  await dialog.getByPlaceholder(/Search blocks/).fill(title);
  await new Promise((r) => setTimeout(r, 300));
  await dialog.getByText(title, { exact: true }).first().click();
  await rows(page).nth(before).waitFor({ state: "visible", timeout: 10_000 });
  const row = rows(page).nth(before);
  const header = row.locator('[role="button"][aria-label*="block"]').first();
  if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
  await new Promise((r) => setTimeout(r, 300));
  return row;
}
// Fields are `<label><span>Label</span><control/></label>`. Match the span text
// structurally: React mirrors a textarea's default value into its text content,
// so accessible-name matching ("Body" → "Body Copy on one side…") is unreliable.
function fieldControl(row, label, nth = 0) {
  const esc = label.replace(/"/g, '\\"');
  return row.locator(`label:has(> span:text-is("${esc}"))`).nth(nth).locator("input, textarea, select").first();
}
async function setField(row, label, value, nth = 0) {
  let el = fieldControl(row, label, nth);
  if (!(await el.count())) {
    // Checkbox fields put the text after the input, with no span.
    el = row.locator(`label:has(> input[type="checkbox"]):text-is("${label}")`).nth(nth).locator("input");
  }
  await el.waitFor({ state: "visible", timeout: 8000 });
  const kind = await el.evaluate((e) => `${e.tagName.toLowerCase()}:${e.getAttribute("type") ?? ""}`);
  if (kind.startsWith("select")) {
    try { await el.selectOption({ label: String(value) }); } catch { await el.selectOption(String(value)); }
  } else if (kind === "input:checkbox") {
    await el.setChecked(Boolean(value));
  } else {
    await el.fill(String(value));
  }
}
async function setMedia(page, row, label, needle) {
  const container = row.getByText(label, { exact: true }).first().locator("xpath=ancestor::div[1]");
  await container.getByRole("button", { name: /^(Choose|Change)$/ }).click();
  await container.getByRole("button", { name: "Library", exact: true }).click().catch(() => {});
  const search = container.getByPlaceholder("Search media...");
  if (!(await search.isVisible().catch(() => false))) {
    await container.getByRole("button", { name: "Pick from library" }).click();
  }
  await search.fill(needle);
  await settle(page, 1500);
  // Library titles come from the file name with dashes turned into spaces.
  const alt = needle.replace(/[-_]+/g, " ");
  const tile = container.locator(`button:has(img[alt*="${alt}" i])`).first();
  await tile.waitFor({ state: "visible", timeout: 15_000 });
  await tile.click();
  await container.getByRole("button", { name: "Use This Media" }).click();
  await new Promise((r) => setTimeout(r, 500));
}
async function fillRepeater(row, spec) {
  const removeButtons = row.getByRole("button", { name: spec.remove, exact: true });
  let have = await removeButtons.count();
  const add = row.getByRole("button", { name: spec.add, exact: true }).first();
  while (have < spec.items.length) { await add.click(); have += 1; await new Promise((r) => setTimeout(r, 200)); }
  while (have > spec.items.length) { await removeButtons.last().click(); have -= 1; await new Promise((r) => setTimeout(r, 200)); }
  for (let i = 0; i < spec.items.length; i += 1) {
    for (const [label, value] of Object.entries(spec.items[i])) await setField(row, label, value, i);
  }
}
async function buildPage(page, def) {
  if (await pageExists(page, def.title)) { log(`page "${def.title}" exists, skipping`); return; }
  await goHash(page, "#/pages/new", 3000);
  const title = page.getByRole("textbox", { name: "Post title" });
  await title.waitFor({ state: "visible", timeout: 20_000 });
  await title.fill(def.title);
  await title.press("Tab");
  await page.getByText("Permalink:").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  for (const b of def.blocks) {
    const row = await addBlock(page, b.block);
    for (const [label, value] of Object.entries(b.fields ?? {})) await setField(row, label, value);
    if (b.repeater) await fillRepeater(row, b.repeater);
    if (b.media) await setMedia(page, row, b.media.label, b.media.needle);
    log(`  + ${b.block}`);
  }
  await waitSaved(page);
  await shot(page, `page-${def.title.toLowerCase().replace(/\W+/g, "-")}-editor`);
  await page.getByRole("button", { name: "Publish post" }).click();
  await page.getByText("Published", { exact: true }).first().waitFor({ state: "visible", timeout: 20_000 });
  await settle(page, 800);
  log(`page "${def.title}" published`);
}

// ───────────────────────────── slug ─────────────────────────────
// Rename a published page's permalink through the editor's slug control.
async function fixSlug(page, title, slug) {
  await goHash(page, "#/pages", 3000);
  const link = page.locator('a[href*="/pages/"]').filter({ hasText: new RegExp(`^\\s*${title}\\s*$`) }).first();
  await link.waitFor({ state: "visible", timeout: 15_000 });
  await link.click();
  await page.getByText("Permalink:").first().waitFor({ state: "visible", timeout: 60_000 });
  const current = await page.getByText("Permalink:").first().locator("..").locator("a").first().getAttribute("href").catch(() => "");
  if (current && current.endsWith(`/${slug}`)) { log(`slug for "${title}" already /${slug}`); return; }
  const permalinkRow = page.getByText("Permalink:").first().locator("..");
  await permalinkRow.getByRole("button", { name: "Edit", exact: true }).click();
  const input = permalinkRow.getByRole("textbox").first();
  await input.waitFor({ state: "visible", timeout: 5000 });
  await input.fill(slug);
  await permalinkRow.getByRole("button", { name: "OK", exact: true }).click();
  await new Promise((r) => setTimeout(r, 600));
  const update = page.getByRole("button", { name: /Update post|Publish post/ });
  if (await update.isEnabled().catch(() => false)) await update.click();
  await waitSaved(page);
  await settle(page, 1200);
  await shot(page, `slug-${slug}`);
  log(`page "${title}" now at /${slug}`);
}

// ───────────────────────────── layouts ─────────────────────────────
// Settings › Shop layouts: pick the shop and product page presets, save.
async function chooseLayouts(page, layouts) {
  await goHash(page, "#/settings/shop-layout", 3500);
  await page.getByRole("heading", { name: "Shop layouts" }).waitFor({ timeout: 20_000 });
  const pick = async (group, name) => {
    const radio = page.getByRole("radiogroup", { name: group }).getByRole("radio", { name: new RegExp(`^${name}\\b`) }).first();
    await radio.waitFor({ state: "visible", timeout: 10_000 });
    if ((await radio.getAttribute("aria-checked")) !== "true") await radio.click();
  };
  await pick("Shop page", layouts.shop);
  await pick("Product page", layouts.product);
  if (layouts.density) await pick("Grid density", layouts.density);
  await settle(page, 600);
  await shot(page, "settings-shop-layout");
  const save = page.getByRole("button", { name: /Save layouts|Saved/ });
  if (await save.isEnabled().catch(() => false)) {
    await save.click();
    await page.getByText(/Shop layouts saved/).waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  }
  await settle(page, 800);
  log(`layouts: shop=${layouts.shop} product=${layouts.product}${layouts.density ? ` density=${layouts.density}` : ""}`);
}

// ───────────────────────────── reading ─────────────────────────────
async function setStaticFrontPage(page) {
  await goHash(page, "#/settings/reading", 3000);
  await page.getByRole("heading", { name: "Reading Settings" }).waitFor({ timeout: 15_000 });
  await page.getByText("A static page", { exact: true }).click();
  await new Promise((r) => setTimeout(r, 600));
  const homepageLabel = page.locator("label", { hasText: /^Homepage$/ }).first();
  const trigger = homepageLabel.locator("xpath=ancestor::div[2]").locator('button[aria-haspopup="listbox"]').first();
  await trigger.click();
  await page.getByPlaceholder("Search pages...").fill("Home");
  await page.getByRole("option", { name: "Home", exact: true }).click();
  await waitSaved(page);
  await settle(page, 1200);
  await shot(page, "reading-static-home");
}

// ───────────────────────────── menus ─────────────────────────────
// The "Add menu items" column; scoped so the sidebar's own "Pages" nav button
// is never confused with the panel section of the same name.
function addPanel(page) {
  return page.getByText("Add menu items", { exact: true }).locator("xpath=..");
}
async function expandSection(page, label) {
  const btn = addPanel(page).locator("button[aria-expanded]").filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).first();
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  await new Promise((r) => setTimeout(r, 300));
  return btn.locator("xpath=..");
}
async function collapseSection(page, label) {
  const btn = addPanel(page).locator("button[aria-expanded]").filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).first();
  if ((await btn.getAttribute("aria-expanded")) === "true") await btn.click();
}
async function structureLabels(page) {
  return page.locator("span.flex-1.truncate.text-xs.font-medium").allTextContents();
}
async function buildMenu(page, def) {
  await goHash(page, "#/menus", 3000);
  await page.getByRole("heading", { name: "Menus", exact: true }).waitFor({ timeout: 15_000 });
  // Only links into the menu editor count — the sidebar has an Appearance › Footer link too.
  const existing = page.locator('a[href*="/menus/"]').filter({ hasText: new RegExp(`^\\s*${def.name}\\s*$`) }).first();
  if (await existing.isVisible().catch(() => false)) {
    log(`menu "${def.name}" exists, resuming`);
    await existing.click();
  } else {
    await page.locator("#menu-name").fill(def.name);
    await page.getByRole("button", { name: "Create Menu" }).click();
  }
  await page.getByRole("heading", { name: /Edit Menu/ }).waitFor({ timeout: 20_000 });
  await settle(page, 1000);
  let have = new Set(await structureLabels(page));
  // Custom links first, in order.
  const missingLinks = def.links.filter((l) => !have.has(l.label));
  if (missingLinks.length) {
    const custom = await expandSection(page, "Custom Links");
    for (const link of missingLinks) {
      await page.locator("#custom-url").fill(link.url);
      await page.locator("#custom-label").fill(link.label);
      await custom.getByRole("button", { name: "Add to Menu" }).click();
      await new Promise((r) => setTimeout(r, 800));
    }
    await collapseSection(page, "Custom Links");
  }
  // Then pages.
  have = new Set(await structureLabels(page));
  const missingPages = (def.pages ?? []).filter((t) => !have.has(t));
  if (missingPages.length) {
    const pagesPanel = await expandSection(page, "Pages");
    await pagesPanel.getByRole("button", { name: "View All" }).click().catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    for (const title of missingPages) {
      const rowLabel = pagesPanel.locator("label").filter({ hasText: new RegExp(`^\\s*${title}\\s*$`) }).first();
      await rowLabel.waitFor({ state: "visible", timeout: 10_000 });
      await rowLabel.click();
    }
    await pagesPanel.getByRole("button", { name: "Add to Menu" }).click();
    await new Promise((r) => setTimeout(r, 1000));
    await collapseSection(page, "Pages");
  }
  // Assign the display location (autosaves).
  const locLabel = page.locator("label").filter({ hasText: new RegExp(`^\\s*${def.location}`) }).first();
  const locBox = locLabel.getByRole("checkbox");
  const state = await locBox.getAttribute("aria-checked").catch(() => null);
  if (state !== "true") await locLabel.click();
  await waitSaved(page);
  await settle(page, 1200);
  await shot(page, `menu-${def.name.toLowerCase().replace(/\W+/g, "-")}`);
  log(`menu "${def.name}" → ${(await structureLabels(page)).join(", ")} @ ${def.location}`);
}

// ───────────────────────────── run ─────────────────────────────
let app;
try {
  app = await _electron.launch({
    executablePath: electronExecutable,
    args: [`--user-data-dir=${profile}`, "--proxy-server=socks5://127.0.0.1:17890", desktopRoot],
    cwd: desktopRoot, env, timeout: 60_000,
  });
  const page = await app.firstWindow();
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("dialog", (d) => void d.accept().catch(() => {}));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.waitForLoadState("domcontentloaded");
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setSize(1500, 980); win.center(); });
  await settle(page, 1500);
  await signIn(page);
  await settle(page, 2000);
  await resetNavigation(page);
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) log("navigated:", frame.url()); });
  if (!only.has("debugswitch")) {
    await pickWebsite(page, ...shop.switcher);
    await shot(page, "site-selected");
  }

  if (only.has("media")) await uploadMedia(page);
  if (only.has("pages")) for (const def of shop.pages) { if (!pageFilter || pageFilter.has(def.title)) await buildPage(page, def); }
  // Appearance › Templates: select the pack card by name and activate it for this environment.
  if (only.has("activate") && shop.template) {
    await goHash(page, "#/appearance/templates", 3500);
    await page.getByRole("heading", { name: "Templates" }).waitFor({ timeout: 20_000 });
    const card = page.getByRole("radio", { name: new RegExp(`^${shop.template}\\b`) }).first();
    await card.waitFor({ state: "visible", timeout: 10_000 });
    await card.click();
    await settle(page, 600);
    const activate = page.getByRole("button", { name: new RegExp(`^Activate ${shop.template}`) });
    if (await activate.isEnabled().catch(() => false)) {
      await activate.click();
      await page.getByText(/is now the active template/).waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
    }
    await settle(page, 800);
    await shot(page, `activate-${shop.template.toLowerCase()}`);
    log(`template ${shop.template} active`);
  }
  // Final showcase: open both live sites through "View website" and keep everything open.
  if (only.has("debugswitch")) {
    const probe = async (label) => {
      const trigger = page.getByRole("button", { name: "Switch website" });
      const info = {
        url: page.url(),
        triggers: await trigger.count().catch((e) => `err ${e.message.split("\n")[0]}`),
        visible: await trigger.first().isVisible().catch(() => "err"),
        interstitial: await page.getByText(/Opening isolated site|Site session unavailable|Choose a website environment/).count().catch(() => "err"),
      };
      log(label, JSON.stringify(info));
    };
    await probe("start");
    await page.getByRole("button", { name: "Switch website" }).click({ noWaitAfter: true });
    await probe("after-click");
    const dialog = page.getByRole("dialog", { name: "Switch website" });
    await dialog.getByRole("combobox", { name: "Search websites" }).fill("Northstar");
    await dialog.getByRole("option", { name: /Northstar Coffee/ }).first().click({ noWaitAfter: true });
    for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 2500)); await probe(`t+${(i + 1) * 2.5}s`); }
    await shot(page, "debug-switch");
  }
  if (only.has("showcase")) {
    const viewWebsite = async (label) => {
      await openEnvMenu(page);
      const item = page.getByRole("menuitem", { name: /View website/ });
      await item.waitFor({ state: "attached", timeout: 10_000 });
      await new Promise((r) => setTimeout(r, 400));
      await item.click({ noWaitAfter: true, force: true, timeout: 10_000 }).catch(async () => {
        await item.dispatchEvent("click").catch(() => {});
      });
      await page.getByText(/running at http:\/\/127\.0\.0\.1:\d+|Could not|exited|did not answer|stopped before|No storefront/i).first().waitFor({ state: "visible", timeout: 240_000 });
      const toasts = await page.locator("[data-sonner-toast]").allTextContents().catch(() => []);
      log(label, "toast:", toasts.join(" | "));
      await settle(page, 1500);
      await resetNavigation(page);
    };
    for (const [needle, pattern, label] of [["Northstar", /Northstar Coffee/, "northstar"], ["Ridgeline", /Ridgeline Cycles/, "ridgeline"]]) {
      await pickWebsite(page, needle, pattern);
      await viewWebsite(label);
      await shot(page, `showcase-${label}`);
    }
    await goHash(page, "#/appearance/templates", 3000);
  }
  if (only.has("customize")) {
    await goHash(page, "#/appearance/customize", 4000);
    await page.getByRole("heading", { name: "Customize" }).waitFor({ timeout: 20_000 });
    await settle(page, 6000);
    await shot(page, "appearance-customize");
    const frame = page.frameLocator('iframe[title="Site preview"]');
    const frameH1 = await frame.locator("h1").first().textContent({ timeout: 30_000 }).catch((e) => `no h1: ${e.message.split("\n")[0]}`);
    log("preview h1:", frameH1?.trim());
    const colorsBtn = page.getByRole("button", { name: /^Colors/ }).first();
    if ((await colorsBtn.getAttribute("aria-expanded").catch(() => "true")) !== "true") await colorsBtn.click();
    await settle(page, 500);
    const primary = page.locator("#customize-primary");
    if (await primary.count()) {
      await primary.fill("#c2410c");
      await settle(page, 2000);
      const applied = await frame.locator("html").evaluate((el) => getComputedStyle(el).getPropertyValue("--primary").trim()).catch((e) => `n/a ${e.message.split("\n")[0]}`);
      log("preview --primary after draft:", applied);
      await shot(page, "appearance-customize-draft");
    }
  }
  if (only.has("templates")) {
    await goHash(page, "#/appearance/templates", 3500);
    await page.getByRole("heading", { name: "Templates" }).waitFor({ timeout: 20_000 });
    await settle(page, 800);
    await shot(page, "appearance-templates");
    const areas = await page.locator("ul li").allTextContents();
    log("coverage rows:", areas.filter((t) => /covered|Core|enabled/.test(t)).length);
  }
  if (only.has("layout") && shop.layouts) await chooseLayouts(page, shop.layouts);
  if (only.has("slug")) for (const [title, slug] of Object.entries(shop.slugs ?? {})) await fixSlug(page, title, slug);
  if (only.has("reading")) await setStaticFrontPage(page);
  if (only.has("menus")) for (const def of shop.menus) await buildMenu(page, def);
  log("done");
} catch (error) {
  log("FAILED", error?.stack ?? error);
  process.exitCode = 1;
  try { const page = await app?.firstWindow(); if (page) await shot(page, "failure"); } catch {}
} finally {
  const uniq = [...new Set(errors)].filter((e) => !/ResizeObserver|favicon|ERR_BLOCKED_BY_CLIENT/.test(e));
  log("renderer errors:", uniq.length ? uniq.slice(0, 12) : "none");
  if (app && !keep) await app.evaluate(({ app: a }) => a.exit(0)).catch(() => {});
  else if (app) { log("keeping Electron open (--keep)"); await new Promise(() => {}); }
}
