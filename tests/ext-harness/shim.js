// Minimal chrome.* stand-in so extension/content.js runs unmodified in the harness page.
// Mirrors extension/background.js: bearer-token API calls to the Crest server, and document text.
(() => {
  const SITE = new URLSearchParams(location.search).get("crest") || "http://localhost:3000";
  const read = () => JSON.parse(localStorage.getItem("shim:store") || "{}");
  const write = (v) => localStorage.setItem("shim:store", JSON.stringify(v));

  const storage = {
    async get(keys) {
      const all = read();
      const out = {};
      for (const k of [].concat(keys)) if (k in all) out[k] = all[k];
      return out;
    },
    async set(obj) {
      write({ ...read(), ...obj });
    },
    async remove(k) {
      const all = read();
      for (const key of [].concat(k)) delete all[key];
      write(all);
    },
  };

  async function api(method, path, body, retried) {
    let { token } = await storage.get("token");
    if (!token) {
      token = (await (await fetch(`${SITE}/api/ext/session`, { method: "POST" })).json()).token;
      await storage.set({ token });
    }
    const res = await fetch(`${SITE}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && !retried) {
      await storage.remove("token");
      return api(method, path, body, true);
    }
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})), site: SITE };
  }

  const docText = () => document.querySelector("iframe").contentDocument.getElementById("ed").innerText;

  window.chrome = {
    storage: { local: storage },
    runtime: {
      lastError: null,
      sendMessage(msg, cb) {
        (async () => {
          try {
            if (msg.type === "api") return await api(msg.method, msg.path, msg.body);
            if (msg.type === "docText") return { ok: true, text: docText() };
            if (msg.type === "settings") return { ok: true, site: SITE };
            return { ok: false, error: "unknown message" };
          } catch (e) {
            return { ok: false, error: String(e) };
          }
        })().then(cb);
      },
    },
  };
})();
