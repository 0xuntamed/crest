// End-to-end test of the browser extension API (Google Docs crests) against a running server.
// Usage: node --experimental-strip-types tests/e2e-ext.ts [baseUrl]
import { createPublicKey, verify } from "node:crypto";
import { gradeTier, sha256Hex, signaturePayload, type CrestLog } from "../src/lib/core.ts";
import { computeDocsMetrics, verifyDocsLog, type DocsEvent } from "../src/lib/docs.ts";

const BASE = process.argv[2] ?? "http://localhost:3000";
const ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const assert = (cond: unknown, msg: string) => {
  if (!cond) {
    console.error("✗", msg);
    process.exit(1);
  }
  console.log("✓", msg);
};

// session + CORS
const pre = await fetch(`${BASE}/api/ext/drafts`, {
  method: "OPTIONS",
  headers: { origin: ORIGIN, "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" },
});
assert(pre.status === 204 && pre.headers.get("access-control-allow-origin") === "*", "CORS preflight allowed");
const { token } = await (await fetch(`${BASE}/api/ext/session`, { method: "POST", headers: { origin: ORIGIN } })).json();
assert(typeof token === "string" && token.length > 20, "extension token issued");
const H = { authorization: `Bearer ${token}`, "content-type": "application/json", origin: ORIGIN };
const call = (method: string, path: string, body?: unknown) =>
  fetch(`${BASE}${path}`, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });

const noAuth = await fetch(`${BASE}/api/ext/drafts`, { headers: { cookie: "crest_author=whatever" } });
assert(noAuth.status === 401, "cookies are ignored by extension routes (401 without bearer)");

// start a recording for a fake doc
const docId = `1E2eDoc${Date.now()}abcdefghijklmn`;
const start = await (await call("POST", "/api/ext/drafts", { docId, title: "On bread" })).json();
assert(start.draftId && start.seq === 0 && !start.resumed, "recording started");
const again = await (await call("POST", "/api/ext/drafts", { docId })).json();
assert(again.draftId === start.draftId && again.resumed, "same doc resumes the open recording");

const before = "Notes from the kitchen.";
const typed =
  "Bread teaches patience. You mix, you wait, you fold, you wait again. My grandmother never measured anything, " +
  "she watched the dough and the dough told her what it needed.";
const quote = "Good bread is the most fundamentally satisfying of all foods.";

let seq = 0;
let lastT = 0;
const now = () => (lastT = Math.max(Date.now(), lastT));
let pending: DocsEvent[] = [[now(), "s", before]];
async function flush() {
  const r = await call("POST", `/api/ext/drafts/${start.draftId}/events`, { seq: seq + 1, events: pending });
  if (!r.ok) throw new Error(`flush ${r.status} ${await r.text()}`);
  seq = (await r.json()).seq;
  pending = [];
}
await flush();

console.log("… typing in real time (~10s)");
pending.push([now(), "m", null]);
let lastFlush = Date.now();
for (const ch of ` ${typed}`) {
  if (Math.random() < 0.03 && ch !== " ") {
    pending.push([now(), "k", "q"]);
    await sleep(60);
    pending.push([now(), "b", 1]);
  }
  pending.push([now(), "k", ch === "\n" ? "\n" : ch]);
  await sleep(ch === " " ? 60 : 20 + Math.random() * 35);
  if (Date.now() - lastFlush > 1000) {
    await flush();
    lastFlush = Date.now();
  }
}
pending.push([now(), "p", ` ${quote}`]);
await flush();
assert(seq > 5, `${seq} batches witnessed`);

// docs-specific validation
const badSnap = await call("POST", `/api/ext/drafts/${start.draftId}/events`, { seq: seq + 1, events: [[now(), "s", "late snapshot"]] });
assert(badSnap.status === 422, "snapshot after the start is rejected (422)");
const multi = await call("POST", `/api/ext/drafts/${start.draftId}/events`, { seq: seq + 1, events: [[now(), "k", "whole words"]] });
assert(multi.status === 400, "multi-character keystroke rejected (400)");
const crestRoute = await call("POST", `/api/ext/drafts/${start.draftId}/events`, {
  seq: seq + 1,
  events: [[now(), 0, 0, "x", "t"]],
});
assert(crestRoute.status === 400, "editor-format events rejected on a Docs recording (400)");

// seal against the document text (Docs export style: BOM + CRLF), with Docs' auto-capitalization
const finalText = `﻿${before}\r\n${typed} ${quote}\r\n`;
const sealRes = await call("POST", `/api/ext/drafts/${start.draftId}/seal`, { finalText, authorName: "E2E Ext", isPublic: false });
const sealed = await sealRes.json();
assert(sealRes.ok && /^[0-9a-f]{12}$/.test(sealed.slug), `sealed as ${sealed.url} (${sealed.tier})`);
const status = await (await call("GET", `/api/ext/drafts/${start.draftId}`)).json();
assert(status.status === "sealed" && status.slug === sealed.slug, "draft reports sealed + slug");
const list = await (await call("GET", "/api/ext/drafts")).json();
assert(list.drafts.some((d: { slug: string }) => d.slug === sealed.slug), "popup list includes the crest");

// independent verification
const log = (await (await fetch(`${BASE}/api/crests/${sealed.slug}/log`)).json()) as CrestLog & {
  source: string;
  content: string;
  seal: { source: "gdocs"; contentHash: string; chainHead: string; chainLength: number; tier: never; sealedMs: number; signature: string };
};
assert(log.source === "gdocs" && typeof log.content === "string", "log carries source and sealed text");
const links = await verifyDocsLog(log);
assert(links.ok && links.head === log.seal.chainHead, "hash chain re-verified locally");
assert((await sha256Hex(log.content)) === log.seal.contentHash, "content hash matches seal");
const { metrics, origins } = computeDocsMetrics(log, log.content);
assert(gradeTier(metrics) === log.seal.tier, `re-graded tier matches: ${log.seal.tier}`);
console.log(
  `  typed ${metrics.typedShare} · pasted ${metrics.pastedShare} · pre-existing ${metrics.docs?.baselineShare} · unaccounted ${metrics.docs?.unaccountedShare}`,
);
assert(origins.slice(0, before.length) === "o".repeat(before.length), "pre-existing line attributed to the snapshot");
assert(origins.slice(-quote.length) === "p".repeat(quote.length), "pasted quote attributed as pasted");
assert(metrics.docs?.unaccountedShare === 0, "nothing unaccounted");
const pk = await (await fetch(`${BASE}/api/pubkey`)).json();
assert(
  verify(null, Buffer.from(signaturePayload({ slug: sealed.slug, ...log.seal })), createPublicKey(pk.pem), Buffer.from(log.seal.signature, "base64")),
  "Ed25519 signature valid (gdocs payload)",
);
assert(
  !verify(
    null,
    Buffer.from(signaturePayload({ ...log.seal, slug: sealed.slug, source: "crest" })),
    createPublicKey(pk.pem),
    Buffer.from(log.seal.signature, "base64"),
  ),
  "signature doesn't verify as an editor crest",
);

// pages
for (const path of [`/c/${sealed.slug}`, `/c/${sealed.slug}/opengraph-image`, "/method"]) {
  const r = await fetch(`${BASE}${path}`);
  assert(r.ok, `GET ${path} → ${r.status}`);
}

// discard
const other = await (await call("POST", "/api/ext/drafts", { docId: `${docId}x` })).json();
const del = await call("DELETE", `/api/ext/drafts/${other.draftId}`);
assert(del.ok, "open recording can be discarded");
console.log(`\nDone → ${sealed.url}`);
