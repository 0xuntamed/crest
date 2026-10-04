const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false })));

function item(href, title, tag, sealed) {
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  const t = document.createElement("span");
  t.className = "t";
  t.textContent = title || "Untitled";
  const g = document.createElement("span");
  g.className = `tag${sealed ? " sealed" : ""}`;
  g.textContent = tag;
  a.append(t, g);
  li.append(a);
  return li;
}

async function load() {
  const s = await send({ type: "settings" });
  $("site").value = s.site || "";
  const list = $("list");
  const r = await send({ type: "api", method: "GET", path: "/api/ext/drafts" });
  list.replaceChildren();
  if (!r.ok) {
    list.append(Object.assign(document.createElement("li"), { className: "muted", textContent: `Can't reach ${s.site}. Check the server URL below.` }));
    return;
  }
  if (!r.data.drafts.length) {
    list.append(Object.assign(document.createElement("li"), { className: "muted", textContent: "Nothing yet. Your sealed docs will show up here." }));
    return;
  }
  for (const d of r.data.drafts) {
    if (d.status === "sealed" && d.slug) list.append(item(`${r.site}/c/${d.slug}`, d.title, d.tier || "sealed", true));
    else list.append(item(`https://docs.google.com/document/d/${d.source_ref}/edit`, d.title, `recording · #${d.seq}`, false));
  }
}

$("site-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const site = $("site").value.trim().replace(/\/+$/, "");
  // A different server means a different identity there.
  await chrome.storage.local.set({ site });
  await chrome.storage.local.remove("token");
  $("site-msg").textContent = "Saved.";
  load();
});

load();
