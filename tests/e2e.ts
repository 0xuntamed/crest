// End-to-end smoke test against a running server.
// Usage: node --experimental-strip-types tests/e2e.ts [baseUrl]
import { createPublicKey, verify } from "node:crypto";
import {
  computeMetrics,
  gradeTier,
  sha256Hex,
  signaturePayload,
  verifyChain,
  type CrestLog,
  type EditEvent,
} from "../src/lib/core.ts";

const BASE = process.argv[2] ?? "http://localhost:3000";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const assert = (cond: unknown, msg: string) => {
  if (!cond) {
    console.error("✗", msg);
    process.exit(1);
  }
  console.log("✓", msg);
};

const TEXT =
  "The best part of writing by hand, even on a keyboard, is the hesitation. You can see a thought arrive, " +
  "get crossed out, and come back better. Machines skip that part, and I think that is exactly why their " +
  "sentences feel weightless. ";
const QUOTE = "As Joan Didion said, I write entirely to find out what I'm thinking.";

// 1. new draft
const r1 = await fetch(`${BASE}/write/new`, { redirect: "manual" });
const cookie = r1.headers.get("set-cookie")!.split(";")[0];
const draftId = r1.headers.get("location")!.split("/").pop()!;
assert(r1.status === 303 && draftId.length === 36, `draft created ${draftId}`);
const H = { cookie, "content-type": "application/json" };

// 2. type with human-ish timing, flushing roughly every second
let seq = 0;
let doc = "";
let pending: EditEvent[] = [];
let lastFlush = Date.now();
let lastT = 0;
const now = () => (lastT = Math.max(Date.now(), lastT));
async function flush() {
  if (!pending.length) return;
  const res = await fetch(`${BASE}/api/drafts/${draftId}/events`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ seq: seq + 1, events: pending }),
  });
  if (!res.ok) throw new Error(`flush failed ${res.status} ${await res.text()}`);
  seq = (await res.json()).seq;
  pending = [];
  lastFlush = Date.now();
}
async function type(s: string) {
  for (const ch of s) {
    // an occasional typo, fixed with backspace
    if (Math.random() < 0.03 && ch !== " ") {
      pending.push([now(), doc.length, 0, "x", "t"]);
      doc += "x";
      await sleep(70);
      pending.push([now(), doc.length - 1, 1, "", "t"]);
      doc = doc.slice(0, -1);
    }
    pending.push([now(), doc.length, 0, ch, "t"]);
    doc += ch;
    await sleep(ch === " " ? 70 : 25 + Math.random() * 40);
    if (Date.now() - lastFlush > 1000) await flush();
  }
}
console.log("… typing in real time (~15s)");
await type(TEXT);
pending.push([now(), doc.length, 0, QUOTE, "p"]);
doc += QUOTE;
await flush();
await type(" That is the whole point.");
await flush();
assert(seq > 5, `${seq} batches witnessed`);

// 3. bad requests are rejected
const bad = await fetch(`${BASE}/api/drafts/${draftId}/events`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ seq: seq + 1, events: [[Date.now(), 99999, 0, "x", "t"]] }),
});
assert(bad.status === 422, "out-of-bounds edit rejected (422)");
const fake = await fetch(`${BASE}/api/drafts/${draftId}/events`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ seq: seq + 1, events: [[Date.now(), 0, 0, "a whole AI paragraph", "t"]] }),
});
assert(fake.status === 400, "multi-char 'typed' event rejected (400)");
const stranger = await fetch(`${BASE}/api/drafts/${draftId}/events`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ seq: seq + 1, events: [[Date.now(), 0, 0, "x", "t"]] }),
});
assert(stranger.status === 401, "writes without the author cookie rejected (401)");

// 4. seal
const sealRes = await fetch(`${BASE}/api/drafts/${draftId}/seal`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ title: "On hesitation", authorName: "E2E Bot", isPublic: true }),
});
const { slug } = await sealRes.json();
assert(sealRes.ok && /^[0-9a-f]{12}$/.test(slug), `sealed as /c/${slug}`);
const again = await fetch(`${BASE}/api/drafts/${draftId}/seal`, { method: "POST", headers: H, body: "{}" });
assert(again.status === 409, "double seal rejected (409)");

// 5. independent verification of the published log
const log = (await (await fetch(`${BASE}/api/crests/${slug}/log`)).json()) as CrestLog & {
  seal: { contentHash: string; chainHead: string; chainLength: number; tier: never; sealedMs: number; signature: string };
};
const check = await verifyChain(log);
assert(check.ok, "hash chain re-verified locally");
if (!check.ok) process.exit(1);
assert(check.doc.content === doc, "replayed text equals what was typed");
assert((await sha256Hex(check.doc.content)) === log.seal.contentHash, "content hash matches seal");
const m = computeMetrics(log, check.doc);
assert(gradeTier(m) === log.seal.tier, `re-graded tier matches: ${log.seal.tier} (typed ${m.typedShare}, witnessed ${m.witnessedShare})`);
const pk = await (await fetch(`${BASE}/api/pubkey`)).json();
const sigOk = verify(
  null,
  Buffer.from(signaturePayload({ slug, ...log.seal })),
  createPublicKey(pk.pem),
  Buffer.from(log.seal.signature, "base64"),
);
assert(sigOk, "Ed25519 signature valid");

// tamper test
const t = structuredClone(log);
t.batches[1].eventsJson = t.batches[1].eventsJson.replace(/"[a-z]"/, '"Z"');
assert(!(await verifyChain(t)).ok, "tampered log fails verification");

// 6. pages, badge, lookup
for (const path of ["/", `/c/${slug}`, "/verify", "/method", "/drafts"]) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
  assert(res.ok, `GET ${path} → ${res.status}`);
}
const badge = await fetch(`${BASE}/api/badge/${slug}`);
assert(badge.headers.get("content-type")?.includes("svg"), "badge is SVG");
const look = await (
  await fetch(`${BASE}/api/verify`, { method: "POST", headers: H, body: JSON.stringify({ text: TEXT.toUpperCase() }) })
).json();
assert(look.match === "excerpt" && look.crests.some((c: { slug: string }) => c.slug === slug), "lookup finds crest from an excerpt");
const full = await (
  await fetch(`${BASE}/api/verify`, { method: "POST", headers: H, body: JSON.stringify({ text: `  ${doc}\n` }) })
).json();
assert(full.match === "exact" && full.crests.some((c: { slug: string }) => c.slug === slug), "lookup finds exact match despite whitespace");
console.log(`\nDone → ${BASE}/c/${slug}`);
