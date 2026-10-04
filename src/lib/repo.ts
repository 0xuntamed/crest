import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { pool, tx } from "./db";
import { signPayload } from "./keys";
import {
  LIMITS,
  applyEvents,
  batchInput,
  computeMetrics,
  genesisInput,
  gradeTier,
  isEditEvent,
  normalizeForLookup,
  sha256Hex,
  signaturePayload,
  slugFromHead,
  verifyChain,
  type CrestLog,
  type EditEvent,
  type Metrics,
  type Tier,
} from "./core";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

// ---------------------------------------------------------------- drafts

export type DraftRow = {
  id: string;
  author_id: string;
  title: string;
  content: string;
  origins: string;
  seq: number;
  head_hash: string;
  last_t: string;
  status: "open" | "sealed";
  created_ms: string;
  updated_at: Date;
};

export async function createDraft(authorId: string): Promise<string> {
  const id = randomUUID();
  const createdMs = Date.now();
  const genesis = await sha256Hex(genesisInput(id, createdMs));
  await pool.query("insert into drafts(id, author_id, head_hash, created_ms) values ($1, $2, $3, $4)", [
    id,
    authorId,
    genesis,
    createdMs,
  ]);
  return id;
}

export async function getDraft(id: string): Promise<DraftRow | null> {
  if (!isUuid(id)) return null;
  const { rows } = await pool.query<DraftRow>("select * from drafts where id = $1", [id]);
  return rows[0] ?? null;
}

export async function listDrafts(authorId: string) {
  const { rows } = await pool.query<{
    id: string;
    title: string;
    preview: string;
    length: number;
    seq: number;
    status: "open" | "sealed";
    updated_at: Date;
    slug: string | null;
    tier: Tier | null;
  }>(
    `select d.id, d.title, left(d.content, 220) as preview, length(d.content) as length, d.seq, d.status, d.updated_at,
            c.slug, c.tier
       from drafts d left join crests c on c.draft_id = d.id
      where d.author_id = $1
      order by d.updated_at desc
      limit 200`,
    [authorId],
  );
  return rows;
}

export async function setDraftTitle(id: string, authorId: string, title: string) {
  const res = await pool.query(
    "update drafts set title = $3, updated_at = now() where id = $1 and author_id = $2 and status = 'open'",
    [id, authorId, title.slice(0, LIMITS.maxTitleLength)],
  );
  if (!res.rowCount) throw new HttpError(404, "draft not found or already sealed");
}

export async function deleteDraft(id: string, authorId: string) {
  const res = await pool.query("delete from drafts where id = $1 and author_id = $2 and status = 'open'", [id, authorId]);
  if (!res.rowCount) throw new HttpError(404, "draft not found or already sealed");
}

/** Appends one batch to a draft's hash chain after replaying it against the server's copy. */
export async function appendBatch(draftId: string, authorId: string, seq: number, events: unknown) {
  if (!Array.isArray(events) || events.length === 0 || events.length > LIMITS.maxEventsPerBatch)
    throw new HttpError(400, "events must be a non-empty array");
  if (!events.every(isEditEvent)) throw new HttpError(400, "malformed event");
  const evs = events as EditEvent[];

  return tx(async (c) => {
    const { rows } = await c.query<DraftRow>("select * from drafts where id = $1 for update", [draftId]);
    const d = rows[0];
    if (!d || d.author_id !== authorId) throw new HttpError(404, "draft not found");
    if (d.status !== "open") throw new HttpError(409, "draft is sealed");
    if (seq !== d.seq + 1) throw new HttpError(409, `expected seq ${d.seq + 1}`);

    let next;
    try {
      next = applyEvents({ content: d.content, origins: d.origins, lastT: Number(d.last_t) }, evs);
    } catch (err) {
      throw new HttpError(422, err instanceof Error ? err.message : "replay failed");
    }

    const prev = await c.query<{ received_ms: string }>(
      "select received_ms from batches where draft_id = $1 order by seq desc limit 1",
      [draftId],
    );
    const floor = prev.rows[0] ? Number(prev.rows[0].received_ms) + 1 : Number(d.created_ms) + 1;
    const receivedMs = Math.max(Date.now(), floor);
    const eventsJson = JSON.stringify(evs);
    const hash = await sha256Hex(batchInput(d.head_hash, seq, receivedMs, eventsJson));

    await c.query(
      `insert into batches(draft_id, seq, events_json, received_at, received_ms, prev_hash, hash)
       values ($1, $2, $3, to_timestamp($4 / 1000.0), $4, $5, $6)`,
      [draftId, seq, eventsJson, receivedMs, d.head_hash, hash],
    );
    await c.query(
      `update drafts set content = $2, origins = $3, last_t = $4, seq = $5, head_hash = $6, updated_at = now()
        where id = $1`,
      [draftId, next.content, next.origins, next.lastT, seq, hash],
    );
    return { seq, headHash: hash, length: next.content.length };
  });
}

// ---------------------------------------------------------------- logs

export async function loadLog(draftId: string): Promise<CrestLog | null> {
  const d = await getDraft(draftId);
  if (!d) return null;
  const { rows } = await pool.query<{
    seq: number;
    received_ms: string;
    prev_hash: string;
    hash: string;
    events_json: string;
  }>("select seq, received_ms, prev_hash, hash, events_json from batches where draft_id = $1 order by seq", [draftId]);
  return {
    version: 1,
    draftId,
    createdMs: Number(d.created_ms),
    genesis: await sha256Hex(genesisInput(draftId, Number(d.created_ms))),
    batches: rows.map((r) => ({
      seq: r.seq,
      receivedMs: Number(r.received_ms),
      prevHash: r.prev_hash,
      hash: r.hash,
      eventsJson: r.events_json,
    })),
  };
}

// ---------------------------------------------------------------- sealing

export async function sealDraft(
  draftId: string,
  authorId: string,
  opts: { title: string; authorName: string; isPublic: boolean },
): Promise<string> {
  const title = opts.title.trim().slice(0, LIMITS.maxTitleLength);
  const authorName = opts.authorName.trim().slice(0, LIMITS.maxNameLength);

  return tx(async (c) => {
    const { rows } = await c.query<DraftRow>("select * from drafts where id = $1 for update", [draftId]);
    const d = rows[0];
    if (!d || d.author_id !== authorId) throw new HttpError(404, "draft not found");
    if (d.status !== "open") throw new HttpError(409, "already sealed");
    if (!d.content.trim()) throw new HttpError(400, "nothing to seal yet");

    const log = await loadLog(draftId);
    if (!log) throw new HttpError(404, "draft not found");
    const check = await verifyChain(log);
    if (!check.ok) throw new HttpError(500, `chain failed verification at batch ${check.atSeq}: ${check.reason}`);
    if (check.doc.content !== d.content || check.head !== d.head_hash)
      throw new HttpError(500, "replay does not match stored draft");

    const metrics = computeMetrics(log, check.doc);
    const tier = gradeTier(metrics);
    const contentHash = sha256(check.doc.content);
    const norm = normalizeForLookup(check.doc.content);
    const slug = slugFromHead(check.head);
    const sealedMs = Date.now();
    const signature = await signPayload(
      signaturePayload({ slug, contentHash, chainHead: check.head, chainLength: check.length, tier, sealedMs }),
    );

    await c.query(
      `insert into crests(slug, draft_id, author_name, title, content, origins, content_hash, lookup_hash, content_norm,
                          metrics, tier, chain_head, chain_length, signature, is_public, sealed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, to_timestamp($16 / 1000.0))`,
      [
        slug,
        draftId,
        authorName,
        title,
        check.doc.content,
        check.doc.origins,
        contentHash,
        sha256(norm),
        norm,
        JSON.stringify(metrics),
        tier,
        check.head,
        check.length,
        signature,
        opts.isPublic,
        sealedMs,
      ],
    );
    await c.query("update drafts set status = 'sealed', title = $2, updated_at = now() where id = $1", [draftId, title]);
    if (authorName) await c.query("update authors set display_name = $2 where id = $1", [authorId, authorName]);
    return slug;
  });
}

// ---------------------------------------------------------------- crests

export type CrestRow = {
  slug: string;
  draft_id: string;
  author_name: string;
  title: string;
  content: string;
  origins: string;
  content_hash: string;
  metrics: Metrics;
  tier: Tier;
  chain_head: string;
  chain_length: number;
  signature: string;
  is_public: boolean;
  sealed_at: Date;
};

export async function getCrest(slug: string): Promise<CrestRow | null> {
  if (!/^[0-9a-f]{12}$/.test(slug)) return null;
  const { rows } = await pool.query<CrestRow>("select * from crests where slug = $1", [slug]);
  return rows[0] ?? null;
}

export async function recentCrests(limit = 9) {
  const { rows } = await pool.query<{
    slug: string;
    title: string;
    author_name: string;
    tier: Tier;
    chain_head: string;
    excerpt: string;
    words: number;
    active_ms: number;
    typed_share: number;
    sealed_at: Date;
  }>(
    `select slug, title, author_name, tier, chain_head, left(content, 260) as excerpt,
            (metrics->>'words')::int as words, (metrics->>'activeMs')::bigint as active_ms,
            (metrics->>'typedShare')::float as typed_share, sealed_at
       from crests where is_public order by sealed_at desc limit $1`,
    [limit],
  );
  return rows;
}

export async function crestStats() {
  const { rows } = await pool.query<{ crests: string; words: string; keystrokes: string }>(
    `select count(*) as crests,
            coalesce(sum((metrics->>'words')::bigint), 0) as words,
            coalesce(sum((metrics->'inserted'->>'t')::bigint), 0) as keystrokes
       from crests`,
  );
  return { crests: Number(rows[0].crests), words: Number(rows[0].words), keystrokes: Number(rows[0].keystrokes) };
}

export async function lookupText(text: string) {
  const norm = normalizeForLookup(text);
  if (norm.length < 20) throw new HttpError(400, "paste at least a sentence or two");
  const exact = await pool.query<{ slug: string; title: string; author_name: string; tier: Tier; sealed_at: Date }>(
    "select slug, title, author_name, tier, sealed_at from crests where lookup_hash = $1 order by sealed_at limit 5",
    [sha256(norm)],
  );
  if (exact.rows.length) return { match: "exact" as const, crests: exact.rows };
  if (norm.length >= 60) {
    const partial = await pool.query<{ slug: string; title: string; author_name: string; tier: Tier; sealed_at: Date }>(
      "select slug, title, author_name, tier, sealed_at from crests where strpos(content_norm, $1) > 0 order by sealed_at limit 5",
      [norm],
    );
    if (partial.rows.length) return { match: "excerpt" as const, crests: partial.rows };
  }
  return { match: "none" as const, crests: [] };
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
