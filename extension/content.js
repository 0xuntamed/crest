// Crest for Google Docs: content script.
// Records keystrokes, pastes, deletes and caret moves in a Google Doc (only after the user presses Record),
// streams them to Crest's witnessed hash chain, and seals the result against the document's text.
(() => {
  if (window.__crestLoaded) return;
  window.__crestLoaded = true;

  // Multi-account URLs look like /document/u/1/d/<id>/edit; reads must go through the same account.
  const urlMatch = location.pathname.match(/\/document\/(?:u\/(\d+)\/)?d\/([A-Za-z0-9_-]{20,120})/);
  if (!urlMatch) return;
  const account = urlMatch[1] ?? null;
  const docId = urlMatch[2];
  const docPath = `/document/${account !== null ? `u/${account}/` : ""}d/${docId}`;

  const KEY = `doc:${docId}`;
  const FLUSH_MS = 1200;
  const MAX_BATCH = 600;
  const MAX_PASTE = 50000;
  const MAX_DOC = 120000;

  // ------------------------------------------------------------ plumbing

  // Never let a lost reply (extension reloaded, worker killed) wedge the recorder.
  const send = (msg, timeoutMs = 20000) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, error: "Crest extension timed out" }), timeoutMs);
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          clearTimeout(timer);
          resolve(r || { ok: false, error: chrome.runtime.lastError?.message || "extension did not respond" });
        });
      } catch (err) {
        clearTimeout(timer);
        resolve({ ok: false, error: err.message }); // "Extension context invalidated" after an update
      }
    });
  const api = (method, path, body) => send({ type: "api", method, path, body });
  const store = {
    get: async () => (await chrome.storage.local.get(KEY))[KEY] || null,
    set: (v) => chrome.storage.local.set({ [KEY]: v }),
    clear: () => chrome.storage.local.remove(KEY),
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const state = {
    phase: "idle", // idle | starting | recording | confirm | sealing | sealed | paused
    draftId: null,
    seq: 0,
    queue: [],
    inflight: false,
    offline: false,
    lastT: 0,
    keys: 0,
    pastes: 0,
    message: "",
    url: "",
    tier: "",
    confirmStop: false,
  };

  const docTitle = () => document.title.replace(/\s*-\s*Google Docs\s*$/i, "").trim();

  async function getDocText() {
    const r = await send({ type: "docText", docId, account });
    if (r.ok && typeof r.text === "string") return r.text;
    // Fallback: the lightweight HTML view, same origin as this page.
    try {
      const res = await fetch(`${docPath}/mobilebasic`, { credentials: "include" });
      if (res.ok) {
        const dom = new DOMParser().parseFromString(await res.text(), "text/html");
        const root = dom.querySelector(".doc-content") || dom.body;
        const blocks = [...root.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li")].map((el) => el.textContent);
        return blocks.length ? blocks.join("\n") : root.textContent || "";
      }
    } catch {}
    throw new Error(r.error || "Couldn't read this document's text");
  }

  // ------------------------------------------------------------ recording

  function push(kind, arg) {
    if (state.phase !== "recording" && state.phase !== "confirm") return;
    const last = state.queue[state.queue.length - 1];
    if (kind === "m" && last && last[1] === "m") return; // collapse repeated caret moves
    const t = Math.max(Date.now(), state.lastT);
    state.lastT = t;
    state.queue.push([t, kind, arg]);
    if (kind === "k" || kind === "i") state.keys += arg.length;
    if (kind === "p") state.pastes++;
    render();
  }

  async function flush() {
    if (state.inflight || !state.queue.length || !state.draftId) return true;
    if (!["recording", "confirm", "sealing"].includes(state.phase)) return false;
    state.inflight = true;
    const events = state.queue.slice(0, MAX_BATCH);
    const seq = state.seq + 1;
    const r = await api("POST", `/api/ext/drafts/${state.draftId}/events`, { seq, events });
    state.inflight = false;

    if (r.ok) {
      state.queue = state.queue.slice(events.length);
      state.seq = r.data.seq;
      state.offline = false;
      render();
      return true;
    }
    if (r.status === 409) {
      // Maybe our batch landed but the response was lost; check before giving up.
      const s = await api("GET", `/api/ext/drafts/${state.draftId}`);
      if (s.ok && s.data.status === "open" && s.data.seq === seq) {
        state.queue = state.queue.slice(events.length);
        state.seq = seq;
        return true;
      }
      return pause(s.ok && s.data.status === "sealed" ? "This recording was already sealed." : "This doc is being recorded in another tab.");
    }
    if (r.status === 404) return pause("This recording no longer exists on the Crest server.");
    if (r.status >= 400 && r.status < 500) return pause(r.data.error || `Crest rejected the batch (${r.status}).`);
    state.offline = true;
    render();
    return false;
  }

  function pause(message) {
    state.phase = "paused";
    state.message = message;
    render();
    return false;
  }

  async function start() {
    state.phase = "starting";
    state.message = "";
    render();
    try {
      const r = await api("POST", "/api/ext/drafts", { docId, title: docTitle() });
      if (!r.ok) throw new Error(r.data.error || r.error || `Crest server error (${r.status})`);
      state.draftId = r.data.draftId;
      state.seq = r.data.seq;
      state.queue = [];
      if (state.seq === 0) {
        const text = await getDocText();
        state.lastT = Date.now();
        state.queue.push([state.lastT, "s", text.slice(0, MAX_DOC)]);
      }
      await store.set({ draftId: state.draftId });
      state.phase = "recording";
      attach();
      render();
      void flush();
    } catch (err) {
      state.phase = "idle";
      state.message = err.message;
      render();
    }
  }

  async function resume() {
    const saved = await store.get();
    if (!saved || !saved.draftId) return;
    const r = await api("GET", `/api/ext/drafts/${saved.draftId}`);
    if (r.ok && r.data.status === "open") {
      state.draftId = saved.draftId;
      state.seq = r.data.seq;
      state.phase = "recording";
      if (state.seq === 0) {
        const text = await getDocText().catch(() => "");
        state.lastT = Date.now();
        state.queue = [[state.lastT, "s", text.slice(0, MAX_DOC)]];
      }
      attach();
    } else if (r.ok && r.data.status === "sealed") {
      state.phase = "sealed";
      state.url = `${r.site}/c/${r.data.slug}`;
    } else if (r.status === 404) {
      await store.clear();
    } else {
      state.message = r.data?.error || r.error || "Couldn't reach Crest.";
    }
    render();
  }

  async function seal({ title, name, isPublic }) {
    state.phase = "sealing";
    render();
    try {
      for (let i = 0; i < 40 && (state.queue.length || state.inflight); i++) {
        await flush();
        if (state.phase === "paused") return;
        if (state.queue.length || state.inflight) await sleep(300);
      }
      if (state.queue.length) throw new Error("Couldn't reach Crest. Check your connection and try again.");
      const finalText = await getDocText();
      const r = await api("POST", `/api/ext/drafts/${state.draftId}/seal`, { finalText, title, authorName: name, isPublic });
      if (!r.ok) throw new Error(r.data.error || `Sealing failed (${r.status})`);
      state.phase = "sealed";
      state.url = r.data.url;
      state.tier = r.data.tier || "";
      await store.set({ draftId: state.draftId, sealed: true });
      try {
        localStorage.setItem("crest:name", name);
      } catch {}
    } catch (err) {
      state.phase = "recording";
      state.message = err.message;
    }
    render();
  }

  async function discard() {
    if (state.draftId) await api("DELETE", `/api/ext/drafts/${state.draftId}`);
    await store.clear();
    Object.assign(state, { phase: "idle", draftId: null, seq: 0, queue: [], keys: 0, pastes: 0, message: "", confirmStop: false });
    render();
  }

  // ------------------------------------------------------------ capture
  // Google Docs routes all keyboard input through a hidden same-origin iframe.

  const attached = new WeakSet();
  let attachTimer = null;

  function attach() {
    tryAttach();
    attachTimer = attachTimer || setInterval(tryAttach, 2000);
  }

  function tryAttach() {
    for (const frame of document.querySelectorAll("iframe.docs-texteventtarget-iframe")) {
      let d;
      try {
        d = frame.contentDocument;
      } catch {
        continue;
      }
      if (!d || attached.has(d)) continue;
      attached.add(d);
      d.addEventListener("keydown", onKey, true);
      d.addEventListener("paste", onPaste, true);
      d.addEventListener("cut", onCut, true);
      d.addEventListener("compositionend", onCompose, true);
    }
    if (!attached.has(document)) {
      attached.add(document);
      document.addEventListener("mousedown", onMouse, true);
    }
  }

  function onKey(e) {
    // Script-dispatched events are never real typing.
    if (!e.isTrusted || e.isComposing || e.key === "Process" || e.key === "Dead" || e.key === "Unidentified") return;
    const k = e.key;
    const altGr = e.ctrlKey && e.altKey && !e.metaKey; // AltGr on Windows reports Ctrl+Alt
    if ((e.ctrlKey || e.metaKey) && !altGr) {
      const l = k.toLowerCase();
      if (l === "z" || l === "y") push("u", null);
      else if (k === "Backspace") push("w", null);
      else if (l === "a" || k.startsWith("Arrow") || k === "Home" || k === "End") push("m", null);
      return; // Ctrl+V / Ctrl+X arrive as paste / cut events
    }
    if (e.altKey && !altGr) {
      if (k === "Backspace") push("w", null);
      return;
    }
    if (k === "Backspace") return push("b", 1);
    if (k === "Delete") return push("x", 1);
    if (k === "Enter") return push("k", "\n");
    if (k === "Tab") return push("k", "\t");
    if (/^(Arrow|Page|Home$|End$)/.test(k)) return push("m", null);
    if ([...k].length === 1) push("k", k);
  }

  function onPaste(e) {
    if (!e.isTrusted) return;
    const text = e.clipboardData && e.clipboardData.getData("text/plain");
    if (text) push("p", text.slice(0, MAX_PASTE));
    else push("m", null); // images or rich content: at least mark the break
  }

  function onCut(e) {
    if (e.isTrusted) push("c", null);
  }

  function onCompose(e) {
    if (!e.isTrusted || !e.data) return;
    for (let i = 0; i < e.data.length; i += 16) push("i", e.data.slice(i, i + 16));
  }

  function onMouse(e) {
    if (!e.isTrusted || e.composedPath().includes(host)) return;
    if (e.target.closest && e.target.closest(".kix-appview-editor, .kix-page, .kix-canvas-tile-content, [data-crest-editor]"))
      push("m", null);
  }

  setInterval(() => void flush(), FLUSH_MS);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && void flush());
  window.addEventListener("pagehide", () => void flush());

  // ------------------------------------------------------------ UI

  const host = document.createElement("crest-recorder");
  const root = host.attachShadow({ mode: "closed" });
  document.documentElement.appendChild(host);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const SEAL = `<svg width="18" height="18" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 1.5l2.6 2.2 3.4-.5 1.4 3.1 3.1 1.4-.5 3.4 2.2 2.6-2.2 2.6.5 3.4-3.1 1.4-1.4 3.1-3.4-.5L16 30.5l-2.6-2.2-3.4.5-1.4-3.1-3.1-1.4.5-3.4L3.8 16 6 13.4l-.5-3.4 3.1-1.4L10 5.5l3.4.5z" fill="#e0472b"/><path d="M20.4 11.4a6 6 0 1 0 0 9.2" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>`;

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    .wrap { position: fixed; right: 20px; bottom: 76px; z-index: 2147483000; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .pill { display: flex; align-items: center; gap: 10px; background: #17140f; color: #f4f0e8; border-radius: 999px; padding: 6px 6px 6px 12px;
            box-shadow: 0 10px 30px -10px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08); font-size: 13px; }
    .pill.idle { padding: 0; }
    button { all: unset; cursor: pointer; border-radius: 999px; font-size: 13px; font-weight: 600; line-height: 1; }
    .start { display: flex; align-items: center; gap: 8px; padding: 10px 14px; color: #f4f0e8; }
    .start:hover { background: rgba(255,255,255,.08); }
    .dot { width: 8px; height: 8px; border-radius: 8px; background: #e0472b; box-shadow: 0 0 0 0 rgba(224,71,43,.6); animation: pulse 1.6s infinite; }
    .dot.off { background: #e3a33a; animation: none; }
    @keyframes pulse { 70% { box-shadow: 0 0 0 7px rgba(224,71,43,0); } 100% { box-shadow: 0 0 0 0 rgba(224,71,43,0); } }
    .stats { font: 500 11.5px ui-monospace, "Geist Mono", monospace; color: #bdb4a4; white-space: nowrap; }
    .seal { background: #e0472b; color: #fff; padding: 8px 14px; }
    .seal:hover { background: #ff6b4d; }
    .x { color: #8a8274; padding: 8px 10px; font-weight: 500; }
    .x:hover { color: #f4f0e8; }
    .x.armed { background: #e0472b; color: #fff; }
    .card { width: 300px; background: #fbf9f4; color: #17140f; border: 1px solid #dad2c2; border-radius: 18px; padding: 16px;
            box-shadow: 0 24px 60px -24px rgba(40,20,5,.45); }
    .label { font: 500 10.5px ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; color: #8a8274; }
    h3 { margin: 4px 0 8px; font: 400 26px/1.05 "Instrument Serif", Georgia, serif; letter-spacing: -.01em; }
    p { margin: 0 0 12px; font-size: 12.5px; line-height: 1.5; color: #4b453b; }
    input[type=text] { width: 100%; margin: 4px 0 10px; padding: 8px 10px; border-radius: 10px; border: 1px solid #dad2c2; background: #f4f0e8; font-size: 13px; color: #17140f; outline: none; }
    input[type=text]:focus { border-color: #8a8274; }
    .row { display: flex; gap: 8px; margin-top: 4px; }
    .row button { flex: 1; text-align: center; padding: 10px; }
    .ghost { border: 1px solid #dad2c2; color: #17140f; }
    .ghost:hover { background: #ebe5d8; }
    .primary { background: #c8371e; color: #fff; }
    .primary:hover { background: #a42a14; }
    .check { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12.5px; margin-bottom: 10px; color: #4b453b; }
    .link { display: block; margin: 8px 0 12px; padding: 8px 10px; border-radius: 10px; background: #ebe5d8; font: 500 11.5px ui-monospace, monospace; color: #17140f; word-break: break-all; }
    .msg { max-width: 300px; background: #17140f; color: #f6dfa9; font-size: 12px; line-height: 1.45; padding: 8px 12px; border-radius: 12px; }
  `;

  function render() {
    const s = state;
    let html = "";
    if (s.phase === "idle") {
      html = `<div class="pill idle"><button class="start" data-a="start" title="Records keystrokes in this document until you seal or stop">${SEAL} Record with Crest</button></div>`;
    } else if (s.phase === "starting") {
      html = `<div class="pill"><span class="stats">Taking a snapshot…</span></div>`;
    } else if (s.phase === "recording" || s.phase === "confirm") {
      const queued = s.offline ? ` · offline, ${s.queue.length} queued` : "";
      html = `<div class="pill">
        <span class="dot ${s.offline ? "off" : ""}"></span>
        <span class="stats">${s.keys.toLocaleString()} keys · ${s.pastes} paste${s.pastes === 1 ? "" : "s"} · #${s.seq}${queued}</span>
        <button class="seal" data-a="confirm">Seal</button>
        <button class="x ${s.confirmStop ? "armed" : ""}" data-a="stop" title="Stop and discard this recording">${s.confirmStop ? "Discard?" : "✕"}</button>
      </div>`;
      if (s.phase === "confirm") {
        let name = "";
        try {
          name = localStorage.getItem("crest:name") || "";
        } catch {}
        html =
          `<div class="card">
            <div class="label">Seal & sign</div>
            <h3>Seal this doc</h3>
            <p>Crest reads the document, credits each word against your recorded typing, and signs the result. Pasted, pre-existing and unexplained text is shown as such.</p>
            <div class="label">Title</div><input type="text" data-f="title" value="${esc(docTitle())}" maxlength="140">
            <div class="label">Signed as (optional)</div><input type="text" data-f="name" value="${esc(name)}" maxlength="60" placeholder="Anonymous">
            <label class="check">List on the public wall <input type="checkbox" data-f="public" checked></label>
            <div class="row"><button class="ghost" data-a="cancel">Keep writing</button><button class="primary" data-a="seal">Seal it</button></div>
          </div>` + html;
      }
    } else if (s.phase === "sealing") {
      html = `<div class="pill"><span class="dot"></span><span class="stats">Reading the doc & sealing…</span></div>`;
    } else if (s.phase === "sealed") {
      html = `<div class="card">
        <div class="label">Sealed${s.tier ? ` · ${esc(s.tier)}` : ""}</div>
        <h3>Your crest is live</h3>
        <a class="link" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>
        <div class="row"><button class="ghost" data-a="copy">Copy link</button><button class="primary" data-a="open">Open</button></div>
        <div class="row"><button class="ghost" data-a="again">Start a new recording</button></div>
      </div>`;
    } else if (s.phase === "paused") {
      html = `<div class="pill"><span class="dot off"></span><span class="stats">Recording paused</span>
        <button class="seal" data-a="retry">Retry</button><button class="x" data-a="stop" title="Stop and discard">✕</button></div>`;
    }
    if (s.message) html += `<div class="msg">${esc(s.message)}</div>`;
    root.innerHTML = `<style>${STYLE}</style><div class="wrap">${html}</div>`;
  }

  // Keep Docs' global shortcuts from swallowing typing in our inputs.
  for (const type of ["keydown", "keyup", "keypress", "input", "paste"]) root.addEventListener(type, (e) => e.stopPropagation());

  root.addEventListener("click", async (e) => {
    const a = e.target.closest && e.target.closest("[data-a]");
    if (!a) return;
    const act = a.getAttribute("data-a");
    if (act !== "stop") state.confirmStop = false;
    if (act === "start") return start();
    if (act === "confirm") {
      state.phase = "confirm";
      state.message = "";
      return render();
    }
    if (act === "cancel") {
      state.phase = "recording";
      return render();
    }
    if (act === "seal") {
      const v = (f) => root.querySelector(`[data-f="${f}"]`);
      return seal({ title: v("title").value, name: v("name").value, isPublic: v("public").checked });
    }
    if (act === "stop") {
      if (!state.confirmStop) {
        state.confirmStop = true;
        return render();
      }
      return discard();
    }
    if (act === "copy") {
      await navigator.clipboard.writeText(state.url).catch(() => {});
      a.textContent = "Copied ✓";
      return;
    }
    if (act === "open") return window.open(state.url, "_blank", "noopener");
    if (act === "again") {
      await store.clear();
      Object.assign(state, { phase: "idle", draftId: null, seq: 0, queue: [], keys: 0, pastes: 0, url: "", tier: "" });
      return start();
    }
    if (act === "retry") {
      state.message = "";
      const r = await api("GET", `/api/ext/drafts/${state.draftId}`);
      if (r.ok && r.data.status === "open") {
        state.seq = r.data.seq;
        state.phase = "recording";
        render();
        return void flush();
      }
      return pause(r.ok ? "This recording was already sealed." : r.data?.error || "Still can't reach Crest.");
    }
  });

  render();
  void resume();
})();
