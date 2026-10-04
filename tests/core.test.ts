// Run with: npm test   (node --experimental-strip-types --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_DOC,
  applyEvents,
  batchInput,
  computeMetrics,
  genesisInput,
  gradeTier,
  sha256Hex,
  verifyChain,
  type CrestLog,
  type EditEvent,
} from "../src/lib/core.ts";

const T0 = 1_760_000_000_000;

function typeText(text: string, start: number, pos: number, gap = 140): EditEvent[] {
  return [...text].map((ch, i) => [start + i * gap, pos + i, 0, ch, "t"] as EditEvent);
}

async function buildLog(batches: Array<{ events: EditEvent[]; receivedMs: number }>, createdMs = T0 - 1000): Promise<CrestLog> {
  const draftId = "00000000-0000-4000-8000-000000000001";
  const genesis = await sha256Hex(genesisInput(draftId, createdMs));
  let prev = genesis;
  const out: CrestLog = { version: 1, draftId, createdMs, genesis, batches: [] };
  for (let i = 0; i < batches.length; i++) {
    const eventsJson = JSON.stringify(batches[i].events);
    const hash = await sha256Hex(batchInput(prev, i + 1, batches[i].receivedMs, eventsJson));
    out.batches.push({ seq: i + 1, receivedMs: batches[i].receivedMs, prevHash: prev, hash, eventsJson });
    prev = hash;
  }
  return out;
}

test("applyEvents tracks content and origins", () => {
  let d = applyEvents(EMPTY_DOC, typeText("hello", T0, 0));
  d = applyEvents(d, [[T0 + 1000, 5, 0, " world", "p"]]);
  d = applyEvents(d, [[T0 + 2000, 0, 1, "H", "t"]]);
  assert.equal(d.content, "Hello world");
  assert.equal(d.origins, "tttttpppppp");
});

test("applyEvents rejects out-of-bounds and time travel", () => {
  assert.throws(() => applyEvents(EMPTY_DOC, [[T0, 1, 0, "x", "t"]]));
  const d = applyEvents(EMPTY_DOC, [[T0, 0, 0, "x", "t"]]);
  assert.throws(() => applyEvents(d, [[T0 - 1, 0, 0, "y", "t"]]));
});

test("chain verifies, and any tampering is caught", async () => {
  const a = typeText("The quick brown fox ", T0, 0);
  const b = typeText("jumps over the lazy dog.", T0 + 3000, 20);
  const log = await buildLog([
    { events: a, receivedMs: T0 + 3000 },
    { events: b, receivedMs: T0 + 7000 },
  ]);
  const ok = await verifyChain(log);
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.doc.content, "The quick brown fox jumps over the lazy dog.");

  const tampered = structuredClone(log);
  tampered.batches[0].eventsJson = tampered.batches[0].eventsJson.replace('"q"', '"Q"');
  const bad = await verifyChain(tampered);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.atSeq, 1);
});

test("metrics and grading are deterministic", async () => {
  const words = "one two three four five six seven eight nine ten ".repeat(4);
  const events = typeText(words, T0, 0, 150);
  const chunks: Array<{ events: EditEvent[]; receivedMs: number }> = [];
  for (let i = 0; i < events.length; i += 10) {
    const slice = events.slice(i, i + 10);
    chunks.push({ events: slice, receivedMs: slice[slice.length - 1][0] + 300 });
  }
  const log = await buildLog(chunks);
  const check = await verifyChain(log);
  assert.ok(check.ok);
  if (!check.ok) return;
  const m1 = computeMetrics(log, check.doc);
  const m2 = computeMetrics(log, check.doc);
  assert.deepEqual(m1, m2);
  assert.equal(m1.typedShare, 1);
  assert.equal(m1.witnessedShare, 1);
  assert.equal(m1.words, 40);
  assert.equal(gradeTier(m1), "handwritten");
});

test("a log uploaded all at once is not witnessed", async () => {
  const words = "one two three four five six seven eight nine ten ".repeat(4);
  // Claims ~5 minutes of typing, but the server received it 1s after the draft was created.
  const events = typeText(words, T0, 0, 1500);
  const log = await buildLog([{ events: events.slice(0, 500), receivedMs: T0 }], T0 - 1000);
  const check = await verifyChain(log);
  assert.ok(check.ok);
  if (!check.ok) return;
  const m = computeMetrics(log, check.doc);
  assert.equal(m.witnessedShare, 0);
  assert.notEqual(gradeTier(m), "handwritten");
});

test("pasted text downgrades the tier", async () => {
  const typed = typeText("I wrote this sentence myself. ", T0, 0);
  const paste: EditEvent = [T0 + 10_000, 30, 0, "Lorem ipsum dolor sit amet, ".repeat(10), "p"];
  const log = await buildLog([
    { events: typed, receivedMs: T0 + 5000 },
    { events: [paste], receivedMs: T0 + 10_500 },
  ]);
  const check = await verifyChain(log);
  assert.ok(check.ok);
  if (!check.ok) return;
  const m = computeMetrics(log, check.doc);
  assert.ok(m.pastedShare > 0.8);
  assert.equal(gradeTier(m), "assembled");
});
