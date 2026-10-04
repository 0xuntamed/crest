// Crest for Google Docs: background service worker.
// Holds the extension's anonymous bearer token and talks to the Crest server.
// The Crest API allows any origin for bearer-token routes, so no host permission is needed for it.

const DEFAULT_SITE = "http://localhost:3000";

async function settings() {
  const { site, token } = await chrome.storage.local.get(["site", "token"]);
  return { site: (site || DEFAULT_SITE).replace(/\/+$/, ""), token };
}

async function newToken(site) {
  const res = await fetch(`${site}/api/ext/session`, { method: "POST" });
  if (!res.ok) throw new Error(`Couldn't reach Crest at ${site} (HTTP ${res.status})`);
  const { token } = await res.json();
  await chrome.storage.local.set({ token });
  return token;
}

async function api(method, path, body, retried = false) {
  const { site } = await settings();
  let { token } = await settings();
  if (!token) token = await newToken(site);
  const res = await fetch(`${site}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  // A token the server doesn't know (fresh database, switched server): start a new identity once.
  if (res.status === 401 && !retried) {
    await chrome.storage.local.remove("token");
    return api(method, path, body, true);
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data, site };
}

/** Plain text of a Google Doc, read with the user's own Docs session. */
async function docText(docId, account) {
  const user = /^\d+$/.test(String(account ?? "")) ? `u/${account}/` : "";
  const url = `https://docs.google.com/document/${user}d/${encodeURIComponent(docId)}/export?format=txt`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Google Docs export failed (HTTP ${res.status})`);
  const type = res.headers.get("content-type") || "";
  if (type.includes("text/html")) throw new Error("Google Docs returned a sign-in page instead of the document");
  return res.text();
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    try {
      if (msg.type === "api") reply(await api(msg.method, msg.path, msg.body));
      else if (msg.type === "docText") reply({ ok: true, text: await docText(msg.docId, msg.account) });
      else if (msg.type === "settings") reply({ ok: true, ...(await settings()) });
      else reply({ ok: false, error: "unknown message" });
    } catch (err) {
      reply({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
  return true; // async reply
});
