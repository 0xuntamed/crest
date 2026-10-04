import { test } from "node:test";
import assert from "node:assert/strict";
import { batchInput, genesisInput, gradeTier, sha256Hex, type CrestLog } from "../src/lib/core.ts";
import { attribute, computeDocsMetrics, typedRuns, verifyDocsLog, type DocsEvent } from "../src/lib/docs.ts";

const T0 = 1_760_000_000_000;

function typing(text: string, start: number, gap = 140): DocsEvent[] {
  return [...text].map((ch, i) => [start + i * gap, "k", ch] as DocsEvent);
}

async function logOf(events: DocsEvent[], perBatch = 40): Promise<CrestLog> {
  const draftId = "00000000-0000-4000-8000-0000000000d0";
  const createdMs = events[0][0] - 500;
  const genesis = await sha256Hex(genesisInput(draftId, createdMs));
  const log: CrestLog = { version: 1, draftId, createdMs, genesis, batches: [] };
  let prev = genesis;
  for (let i = 0; i < events.length; i += perBatch) {
    const chunk = events.slice(i, i + perBatch);
    const receivedMs = chunk[chunk.length - 1][0] + 400;
    const eventsJson = JSON.stringify(chunk);
    const seq = log.batches.length + 1;
    const hash = await sha256Hex(batchInput(prev, seq, receivedMs, eventsJson));
    log.batches.push({ seq, receivedMs, prevHash: prev, hash, eventsJson });
    prev = hash;
  }
  return log;
}

const ESSAY =
  "Bread teaches patience. You mix, you wait, you fold, you wait again. My grandmother never measured anything, " +
  "she watched the dough and the dough told her what it needed. I have tried for years to learn that kind of listening.";

test("typedRuns applies backspace within a run and splits on caret moves", () => {
  const ev: DocsEvent[] = [
    ...typing("helo", T0),
    [T0 + 1000, "b", 1],
    ...typing("lo world", T0 + 1100),
    [T0 + 3000, "m", null],
    ...typing("again", T0 + 3100),
  ];
  assert.deepEqual(typedRuns(ev), ["hello world", "again"]);
});

test("fully typed document is credited as typed and grades handwritten", async () => {
  const events: DocsEvent[] = [[T0, "s", ""], ...typing(ESSAY, T0 + 100, 90)];
  const log = await logOf(events);
  assert.ok((await verifyDocsLog(log)).ok);
  const { metrics, origins } = computeDocsMetrics(log, ESSAY);
  assert.equal(origins.length, ESSAY.length);
  assert.equal(metrics.typedShare, 1);
  assert.equal(metrics.docs?.unaccountedShare, 0);
  assert.equal(gradeTier(metrics), "handwritten");
});

test("Docs auto-capitalization and smart quotes still match typed words", () => {
  const events: DocsEvent[] = [[T0, "s", ""], ...typing("i don't know. it's fine", T0 + 10)];
  const { origins } = { origins: attribute("I don’t know. It’s fine", events).origins };
  assert.ok(!origins.includes("u"));
});

test("typed words are highlighted where they were typed, not at earlier copies of the same words", () => {
  const unlogged = "Machines wrote this sentence without any keystrokes at all.";
  const typed = " i wrote this one by hand key by key";
  const events: DocsEvent[] = [[T0, "s", ""], ...typing(typed, T0 + 10)];
  const a = attribute(unlogged + typed, events);
  assert.equal(a.origins.slice(0, unlogged.length), "u".repeat(unlogged.length));
  assert.equal(a.origins.slice(unlogged.length + 1), "t".repeat(typed.length - 1));
});

test("exact pastes are marked pasted", () => {
  const quote = "the first draft is just you telling yourself the story";
  const events: DocsEvent[] = [[T0, "s", ""], ...typing("As Terry Pratchett said, ", T0 + 10), [T0 + 9000, "p", quote]];
  const a = attribute(`As Terry Pratchett said, ${quote}`, events);
  assert.equal(a.origins.slice(-quote.length), "p".repeat(quote.length));
  assert.ok(a.origins.startsWith("tttt"));
});

test("text already in the doc is pre-existing, not typed", () => {
  const before = "Chapter one. The house on the hill had been empty for years.";
  const events: DocsEvent[] = [[T0, "s", before], ...typing(" Then someone moved in.", T0 + 10)];
  const a = attribute(`${before} Then someone moved in.`, events);
  assert.equal(a.origins.slice(0, before.length), "o".repeat(before.length));
  assert.equal(a.baselineChars >= before.length, true);
});

test("junk typing cannot launder text pasted with the extension off", async () => {
  // Types 900 junk characters (inflating keystroke counts), then the doc ends up holding an essay the log never saw.
  const junk = "asdf qwer zxcv ".repeat(60);
  const events: DocsEvent[] = [[T0, "s", ""], ...typing(junk, T0 + 10, 60)];
  const log = await logOf(events);
  const { metrics } = computeDocsMetrics(log, ESSAY);
  assert.equal(metrics.typedShare, 0);
  assert.ok((metrics.docs?.unaccountedShare ?? 0) > 0.9);
  assert.equal(gradeTier(metrics), "assembled");
});

test("docs metrics are deterministic and the chain detects tampering", async () => {
  const events: DocsEvent[] = [[T0, "s", ""], ...typing(ESSAY, T0 + 100, 90)];
  const log = await logOf(events);
  assert.deepEqual(computeDocsMetrics(log, ESSAY), computeDocsMetrics(log, ESSAY));
  const bad = structuredClone(log);
  bad.batches[1].eventsJson = bad.batches[1].eventsJson.replace('"k","a"', '"k","Z"');
  assert.equal((await verifyDocsLog(bad)).ok, false);
});

test("a log without a starting snapshot is rejected", async () => {
  const log = await logOf(typing("no snapshot here", T0));
  assert.equal((await verifyDocsLog(log)).ok, false);
});
