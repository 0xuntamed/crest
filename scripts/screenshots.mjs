// Generates the README screenshots by actually using the product: it types demo pieces into the real
// editor and the real extension content script (via the Docs harness), seals them, and captures each screen.
//
//   npm run dev            # Crest on :3000
//   npm run ext:harness    # Docs look-alike on :4100
//   npm run screenshots    # -> docs/screenshots/*
//
// Uses your installed Microsoft Edge (CREST_BROWSER=chrome for Chrome) through playwright-core.
// Typing happens in real time, so every crest is genuinely witnessed. Takes a few minutes.
// Run a single step with ONLY=essay|paste|docs|pages.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";

const SITE = process.env.CREST_URL ?? "http://localhost:3000";
const HARNESS = process.env.HARNESS_URL ?? "http://localhost:4100";
const OUT = join(process.cwd(), "docs", "screenshots");
const SLUGS = join(OUT, "slugs.json");
const ONLY = process.env.ONLY;
const channel = process.env.CREST_BROWSER === "chrome" ? "chrome" : "msedge";
await mkdir(OUT, { recursive: true });

// ------------------------------------------------------------ demo content (original text)

const ESSAY = {
  title: "On hesitation",
  author: "Mara Quinn",
  paragraphs: [
    "The best part of writing is the hesitation. You can watch a thought arrive, get crossed out, and come back a little better than it left. I used to think that was wasted time. Now I think it is the whole job.",
    "When I draft, I type a sentence, stare at it, and delete half. Then I put a different half back. Nobody sees that dance in the finished piece, and maybe nobody should. But it is there, in every paragraph that ever felt true.",
    "A machine can skip the hesitation. It can hand you a clean paragraph in a second. What it cannot hand you is the reason you chose this word instead of that one, at two in the morning, with your coffee gone cold.",
  ],
};

const PASTE = {
  title: "Notes on a slow morning",
  author: "Theo Okafor",
  before:
    "Sunday, early. The street is still blue and the radiator is ticking like it has opinions. I am trying to write about patience, which is funny, because I keep checking my phone.\n\nMy grandmother kept a line from an old cookbook taped above her stove: ",
  paste: "“Good bread cannot be rushed, and neither can good people.”",
  after: " I used to think it was about bread. These days I think it was about everything she did slowly, on purpose.",
};

const DOCS = {
  existing: "The Lighthouse\nDraft 3. Notes to self: slow down the opening.",
  typed:
    " The keeper climbed the stairs every night at nine, counting them out loud so the dark would know he was coming. Two hundred and twelve. He never missed one, not even the winter his knees gave out.",
  paste: " (research: check when the lamp was converted to electric)",
};

// ------------------------------------------------------------ human-ish typing

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LETTERS = "qwertyuiopasdfghjklzxcvbnm";

async function humanType(keyboard, text, r, scale = 1) {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") {
      await keyboard.press("Enter");
      await sleep(900 * scale);
      continue;
    }
    if (/[a-z]/.test(ch) && r() < 0.025) {
      await keyboard.type(LETTERS[Math.floor(r() * LETTERS.length)]);
      await sleep((140 + r() * 200) * scale);
      await keyboard.press("Backspace");
      await sleep((80 + r() * 120) * scale);
    }
    await keyboard.type(ch);
    let d = 45 + r() * 95;
    if (ch === " ") d += 30 + r() * 60;
    if (ch === ",") d += 180 + r() * 300;
    if (ch === "." && text[i + 1] === " ") d += 450 + r() * 700;
    if (r() < 0.02) d += 600 + r() * 900; // a thinking pause
    await sleep(d * scale);
  }
}

// ------------------------------------------------------------ helpers

const browser = await chromium.launch({ channel, headless: true });
const made = [];
// Hide the Next.js dev-mode indicator; it never appears in production.
const HIDE_DEV_UI = `addEventListener("DOMContentLoaded", () => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal { display: none !important; }";
  document.head.appendChild(s);
});`;

async function newContext(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1.5, colorScheme: "light", ...opts });
  await ctx.addInitScript(HIDE_DEV_UI);
  return ctx;
}

async function shot(target, name, opts = {}) {
  await target.screenshot({ path: join(OUT, `${name}.png`), ...opts });
  made.push(`${name}.png`);
  console.log(`  ✓ ${name}.png`);
}

async function slugs() {
  try {
    return JSON.parse(await readFile(SLUGS, "utf8"));
  } catch {
    return {};
  }
}
async function saveSlug(key, slug) {
  await writeFile(SLUGS, JSON.stringify({ ...(await slugs()), [key]: slug }, null, 2));
}

async function openEditor(page, title) {
  await page.goto(`${SITE}/write/new`);
  await page.waitForSelector("textarea.writer");
  await page.locator('input[aria-label="Title"]').pressSequentially(title, { delay: 45 });
  await page.locator("textarea.writer").click();
}

async function sealInEditor(page, author) {
  await page.getByRole("button", { name: "Seal this piece" }).click();
  await page.locator('input[placeholder="Anonymous"]').fill(author);
}

const readerCard = (page) => page.locator("section.card").first();

// ------------------------------------------------------------ steps

async function essay() {
  console.log("essay: typing 'On hesitation' in the editor (real time, ~2 min)…");
  const ctx = await newContext();
  const page = await ctx.newPage();
  await openEditor(page, ESSAY.title);
  const r = rng(7);
  for (let i = 0; i < ESSAY.paragraphs.length; i++) {
    if (i > 0) {
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
      await sleep(1200);
    }
    await humanType(page.keyboard, ESSAY.paragraphs[i], r);
    if (i === 1) {
      await sleep(2000);
      await shot(page, "editor");
    }
  }
  await sleep(2500);
  await sealInEditor(page, ESSAY.author);
  await sleep(400);
  await shot(page, "seal-dialog");
  await page.getByRole("button", { name: "Seal it" }).click();
  await page.waitForURL(/\/c\/[0-9a-f]{12}/);
  const slug = page.url().match(/\/c\/([0-9a-f]{12})/)[1];
  await saveSlug("essay", slug);
  await sleep(1500);
  await shot(page, "crest");

  await page.getByRole("button", { name: "▶ Replay" }).click();
  await sleep(6000);
  await page.getByRole("button", { name: "Pause" }).click();
  await readerCard(page).scrollIntoViewIfNeeded();
  await sleep(300);
  await shot(readerCard(page), "replay");

  await page.getByRole("button", { name: "Run verification" }).click();
  await page.getByText("Verified", { exact: true }).waitFor({ timeout: 30000 });
  await sleep(700);
  const grid = page.locator("section", { has: page.getByText("Check it yourself") }).last();
  await grid.scrollIntoViewIfNeeded();
  await shot(grid, "verify");
  await ctx.close();
}

async function paste() {
  console.log("paste: typing 'Notes on a slow morning' with a pasted quote…");
  const ctx = await newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  await openEditor(page, PASTE.title);
  const r = rng(11);
  await humanType(page.keyboard, PASTE.before, r, 0.6);
  await page.evaluate((t) => navigator.clipboard.writeText(t), PASTE.paste);
  await page.keyboard.press("Control+V");
  await sleep(900);
  await humanType(page.keyboard, PASTE.after, r, 0.6);
  await sleep(2500);
  await sealInEditor(page, PASTE.author);
  await page.getByRole("button", { name: "Seal it" }).click();
  await page.waitForURL(/\/c\/[0-9a-f]{12}/);
  await saveSlug("paste", page.url().match(/\/c\/([0-9a-f]{12})/)[1]);
  await sleep(1200);
  await readerCard(page).scrollIntoViewIfNeeded();
  await sleep(300);
  await shot(readerCard(page), "highlights");
  await ctx.close();
}

async function docs() {
  console.log("docs: recording a document with the extension (Docs harness)…");
  const ctx = await newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1180, height: 680 } });
  const page = await ctx.newPage();
  const docId = `1ReadmeDemo${Date.now().toString(36)}ABCDEFGHIJKLMNOP`;
  await page.goto(`${HARNESS}/document/d/${docId}/edit?crest=${encodeURIComponent(SITE)}`);
  const editor = page.frameLocator("iframe.docs-texteventtarget-iframe").locator("#ed");
  await editor.click();
  await page.keyboard.insertText(DOCS.existing); // already in the doc before recording (no key events)
  await page.locator("crest-recorder").waitFor({ state: "attached" });
  await page.evaluate(() => {
    document.title = "The Lighthouse - Google Docs";
    document.querySelector(".bar span").textContent = "The Lighthouse";
  });

  // The control lives in a closed shadow root, so it is clicked by position (anchored bottom-right).
  const { width: W, height: H } = page.viewportSize();
  const started = page.waitForResponse((res) => /\/api\/ext\/drafts\/[^/]+\/events$/.test(res.url()) && res.ok());
  await page.mouse.click(W - 90, H - 95); // "Record with Crest"
  await started;
  await editor.click();
  await page.keyboard.press("Control+End");
  await humanType(page.keyboard, DOCS.typed, rng(23), 0.6);
  await page.evaluate((t) => navigator.clipboard.writeText(t), DOCS.paste);
  await page.keyboard.press("Control+V");
  await sleep(2600);
  await shot(page, "extension-recording");

  await page.mouse.click(W - 84, H - 97); // "Seal"
  await sleep(700);
  await shot(page, "extension-seal");
  const sealed = page.waitForResponse((res) => /\/api\/ext\/drafts\/[^/]+\/seal$/.test(res.url()), { timeout: 20000 });
  await page.mouse.click(W - 101, H - 162); // "Seal it"
  const { slug } = await (await sealed).json();
  await saveSlug("docs", slug);
  await sleep(800);
  await shot(page, "extension-sealed");

  await page.goto(`${SITE}/c/${slug}`);
  await sleep(1200);
  await shot(page, "docs-crest");
  await readerCard(page).scrollIntoViewIfNeeded();
  await sleep(300);
  await shot(readerCard(page), "docs-highlights");
  await ctx.close();
}

async function pages() {
  console.log("pages: home, wall, lookup, method, share images, dark, mobile…");
  const s = await slugs();
  const ctx = await newContext();
  const page = await ctx.newPage();
  await page.goto(`${SITE}/`);
  await sleep(7000); // let the hero demo type for a while
  await shot(page, "home");
  await page.getByText("Freshly sealed").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -60));
  await sleep(500);
  await shot(page, "wall");

  await page.goto(`${SITE}/verify`);
  await page.locator("textarea").fill(ESSAY.paragraphs[1].toUpperCase());
  await page.getByRole("button", { name: "Check for a crest" }).click();
  await page.getByText("This passage appears inside").waitFor();
  await sleep(500);
  await shot(page, "lookup");

  await page.goto(`${SITE}/method`);
  await sleep(500);
  await shot(page, "method");

  if (s.essay) {
    await page.goto(`${SITE}/c/${s.essay}`);
    await page.getByText("Where the text came from").evaluate((el) => {
      el.closest("section").scrollIntoView({ block: "start" });
      window.scrollBy(0, -80); // clear the sticky header
    });
    await sleep(600);
    await shot(page, "crest-charts");
  }

  const files = [["/opengraph-image", "banner.png"]];
  if (s.essay) files.push([`/c/${s.essay}/opengraph-image`, "share-card.png"], [`/api/badge/${s.essay}`, "badge.svg"]);
  for (const [path, file] of files) {
    const res = await page.request.get(`${SITE}${path}`);
    await writeFile(join(OUT, file), await res.body());
    made.push(file);
    console.log(`  ✓ ${file}`);
  }
  await ctx.close();

  if (s.essay) {
    const dark = await newContext({ colorScheme: "dark" });
    const pd = await dark.newPage();
    await pd.goto(`${SITE}/c/${s.essay}`);
    await sleep(1200);
    await shot(pd, "crest-dark");
    await dark.close();
  }
  if (s.paste) {
    const mobile = await newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pm = await mobile.newPage();
    await pm.goto(`${SITE}/c/${s.paste}`);
    await sleep(1200);
    await shot(pm, "mobile");
    await mobile.close();
  }
}

const steps = { essay, paste, docs, pages };
try {
  for (const [name, fn] of Object.entries(steps)) if (!ONLY || ONLY === name) await fn();
} finally {
  await browser.close();
}
console.log(`\nDone: ${made.length} files in docs/screenshots`);
